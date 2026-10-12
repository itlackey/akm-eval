import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { MEASUREMENT } from "./measurement.ts";
import { QUESTION_TYPES } from "./dataset.ts";
import { RETRIEVAL_K } from "./score.ts";
import { TOP_K } from "./collect.ts";

// The golden files are in ../golden/: seven questions, one of each type and two abstention questions, with 30 raw outputs for them. Each is a
// realistic answer of the collector: the sessions akm returned, what the reader answered in each arm and what the judge said. They cover a
// right answer and each way to get it wrong, a reader that cannot take the history or returns nothing or is cut off, a judge that cannot be
// reached or says more than yes or no, an akm that times out or fails, and the runs with no model. cases.jsonl is a copy of the questions, with
// short histories, so a change to the dataset does not move them. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN);
    expect(goldenProblems(MEASUREMENT, GOLDEN)).toEqual([]);
  });

  test("the raw outputs cover every question type, abstention, a run with no model, errors, timeouts and empty output", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
    expect(new Set(expected.map((r) => r.question_type))).toEqual(new Set(QUESTION_TYPES));
    const arms = expected.flatMap((r) => [r.without_akm, r.with_akm]).filter((a) => a !== null);
    expect(expected.some((r) => r.abstention)).toBe(true);
    expect(expected.some((r) => r.without_akm === null && r.with_akm === null)).toBe(true); // retrieval-only
    expect(arms.some((a) => a.ok === false && a.error.startsWith("HTTP 400"))).toBe(true); // the reader cannot take the history
    expect(arms.some((a) => a.ok === false && a.error.startsWith("judge: "))).toBe(true); // the judge cannot be reached
    expect(arms.some((a) => a.ok === false && a.error.startsWith("akm: "))).toBe(true); // the arm with akm, with no search
    expect(expected.some((r) => r.timed_out === true)).toBe(true);
    expect(expected.some((r) => r.retrieval_error !== null && r.timed_out === false)).toBe(true);
    expect(arms.some((a) => a.hypothesis === "")).toBe(true); // the reader returned nothing
    expect(arms.some((a) => a.finish_reason === "length")).toBe(true); // the reader was cut off
    expect(arms.some((a) => a.ok && a.decidable === false)).toBe(true); // a verdict that is not plainly yes or no
    expect(expected.some((r) => r.retrieval !== null && r.retrieval.returned === 0)).toBe(true); // akm returned nothing
    expect(expected.some((r) => r.sessions_over_projection_limit > 0)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const row = (note: string, id?: string) => expected.find((_, i) => raw[i].note === note && (id === undefined || raw[i].case === id));
    const right = (note: string) => [row(note).without_akm.correct, row(note).with_akm.correct];
    // a verdict with "yes" in it is correct, as the benchmark's evaluate_qa.py has it, and one without is not
    expect(right("akm finds the evidence and both arms answer right")).toEqual([true, true]);
    expect(right("akm misses the evidence, so the arm with akm cannot answer and the full history can")).toEqual([true, false]);
    expect(right("the reader names another degree and the judge says no")).toEqual([false, false]);
    expect(right("the judge answers more than yes or no")).toEqual([true, true]); // "Yes, the response is correct." holds a yes
    expect(row("the judge answers more than yes or no").without_akm.decidable).toBe(false);
    expect(row("the judge answers more than yes or no").with_akm.decidable).toBe(true); // "Yes." is plain
    expect(right("the judge says the response is only partly right, which holds no yes")).toEqual([false, true]);
    expect(row("the judge says the response is only partly right, which holds no yes").without_akm.decidable).toBe(false);
    // an arm with no verdict is not scored: not right and not wrong
    const refused = row("the endpoint refuses the whole history, and the arm with akm still answers");
    expect(refused.without_akm).toMatchObject({ ok: false, correct: null, decidable: null, hypothesis: null });
    expect(refused.with_akm).toMatchObject({ ok: true, correct: true });
    const unjudged = row("the judge cannot be reached for the arm with akm, and the answer is kept");
    expect(unjudged.with_akm).toMatchObject({ ok: false, correct: null, hypothesis: "Tuscan white bean soup", error: "judge: HTTP 429: rate limit reached for requests" });
    // a reader that returns nothing, and one that is cut off, are judged as the judge says
    expect(right("the reader returns nothing, and the judge is asked about an empty answer")).toEqual([false, false]);
    expect(row("the reader is cut off at the token limit, and what it wrote is judged as it is").without_akm).toMatchObject({ ok: true, correct: true, finish_reason: "length" });
    // akm: a timeout is not a failure, and a failure has no retrieval, and the arm with akm has no answer
    const timedOut = row("akm timed out on the index, so there is no retrieval and the arm with akm has no answer");
    expect(timedOut).toMatchObject({ timed_out: true, retrieval: null, retrieved_session_ids: null, retrieval_error: "akm index timed out after 120s" });
    expect(timedOut.with_akm).toMatchObject({ ok: false, correct: null, error: "akm: akm index timed out after 120s" });
    expect(row("akm fails on the search for another reason than time")).toMatchObject({ timed_out: false, retrieval: null });
    // retrieval: the share of the evidence sessions found, over the first five
    expect(row("akm finds two of the three sessions").retrieval).toMatchObject({ hit: true, recall: 0.6667, mrr: 1 });
    expect(row("akm finds all three sessions").retrieval).toMatchObject({ hit: true, recall: 1 });
    expect(row("akm finds none of them").retrieval).toMatchObject({ hit: false, recall: 0, mrr: 0, returned: 1 });
    expect(row("akm returns nothing for the question").retrieval).toMatchObject({ hit: false, returned: 0 });
    // an abstention question is marked, and has nothing to find
    expect(row("the model says it does not know, which is right for an abstention question")).toMatchObject({ abstention: true, expected: "The information provided is not enough: you did not mention the name of your first dog." });
    expect(row("akm finds the evidence and both arms answer right").abstention).toBe(false);
    // a run with no model has no arms
    expect(row("a retrieval-only run finds the evidence")).toMatchObject({ without_akm: null, with_akm: null, retrieval: { hit: true } });
  });

  test("the summary takes its counts, notes and metrics from the rows", () => {
    const cases = lines("cases.jsonl");
    const raw = lines("raw.jsonl");
    const score = (line: any) => MEASUREMENT.score(cases.find((c) => c.question_id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw);
    const withModel = raw.filter((l) => l.raw.without_akm !== null || l.raw.with_akm !== null).map(score);
    const summary = MEASUREMENT.summarize(withModel);
    expect(summary).toMatchObject({ n_run: 26, n_scored: 21, n_errored: 5, timeouts: 1, observed_models: ["qwen3-27b"], observed_judge_models: ["gpt-4o-2024-08-06", "gpt-4o-mini-2024-07-18"], sessions_loaded: 79, sessions_over_projection_limit: 1 });
    expect(summary.metrics.accuracy).toMatchObject({ without_akm: { n: 24, correct: 18, n_errored: 2 }, with_akm: { n: 22, correct: 12, n_errored: 4 } });
    expect(summary.metrics.accuracy?.difference).toMatchObject({ n: 21, only_with_akm: 1, only_without_akm: 5, both_correct: 10, neither: 5 });
    expect(summary.metrics.retrieval_abstention).toEqual({ n: 3 });
    expect(summary.metrics.retrieval).toMatchObject({ k: RETRIEVAL_K, n: 21 });
    expect(summary.judge_undecidable).toBe(2);
    expect(summary.notes).toEqual([
      "The judge is not gpt-4o-2024-08-06, the judge the benchmark specifies (it answered as gpt-4o-2024-08-06, gpt-4o-mini-2024-07-18). These scores are not comparable to published LongMemEval numbers.",
      "The judge gave an answer other than yes or no for 2 of 46 verdicts. Use a judge that answers directly.",
      "akm timed out on 1 of 26 questions (an index or a search took longer than its limit), and they count as errored. A slower akm shows up here.",
    ]);
    // a run with no model has no accuracy, and counts a question scored when akm searched it
    const retrievalOnly = MEASUREMENT.summarize(raw.filter((l) => l.raw.without_akm === null && l.raw.with_akm === null).map(score));
    expect(retrievalOnly).toMatchObject({ n_run: 4, n_scored: 3, n_errored: 1, timeouts: 0, observed_models: [], notes: [] });
    expect(retrievalOnly.metrics).toMatchObject({ accuracy: null, by_type: null, retrieval_abstention: { n: 1 } });
  });

  test("the scorer cuts the retrieval where the collector asks akm to stop", () => {
    expect(RETRIEVAL_K).toBe(TOP_K);
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "longmemeval-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), retrieval: null }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(gold-su-01, "akm finds the evidence and both arms answer right"\) is not the expected one: retrieval: expected \{/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir))).toEqual([]);
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    const problems = withCopy((dir) => {
      writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: live + 1 }));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems).toEqual([`scorer.json is for scorer version ${live + 1} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
  });

  test("a raw output the scorer cannot read, a case that is not there and a missing file are named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      const { verdict: _gone, ...arm } = raw[0].raw.with_akm;
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { ...raw[0].raw, with_akm: arm } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (gold-su-01, "akm finds the evidence and both arms answer right"): the raw output lacks with_akm.verdict',
      'raw.jsonl line 2 (no-such-case, "akm misses the evidence, so the arm with akm cannot answer and the full history can"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir)))[0]).toContain("expected.jsonl is missing");
  });
});
