import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { MEASUREMENT } from "./measurement.ts";
import { KINDS } from "./pool-score.ts";
import { RELATIONS } from "./cases.ts";

// The golden files are in ../golden/ for the per-case run and in ../golden/pool/ for --pool. The per-case ones are 21 pairs of the public
// cases with 25 raw outputs: the right answer, each way to get it wrong, and each way the run can end without a verdict. The pool ones are 16
// clusters of the public pool with 19 raw outputs of the one improve run. Each output is what the collector stores of an akm result in the
// shape akm 0.9.26 prints it. cases.jsonl is a copy of those cases, so a change to the corpus does not move them. See lib/golden.ts.
//
// expected.jsonl leaves out the copies of the raw output that a row keeps so that it can be scored again: what is left is the row the eval
// scored before it was split into a scorer and a collector (the code at 3ae7c07 gives these rows for the same akm results).
const GOLDEN = join(import.meta.dir, "..", "golden");
const POOL = join(GOLDEN, "pool");
const OPTIONS = { omit: ["pair_pass", "retire_proposals", "usage", "hint"] };
const POOL_OPTIONS = { omit: ["run", "retire_proposals"] };
const lines = (dir: string, file: string): any[] => readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the per-case scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, OPTIONS);
    expect(goldenProblems(MEASUREMENT, GOLDEN, OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every relation, every outcome, every way to end in an error and a timeout", () => {
    const raw = lines(GOLDEN, "raw.jsonl");
    const expected = lines(GOLDEN, "expected.jsonl");
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
    expect(new Set(expected.map((r) => r.relation))).toEqual(new Set(RELATIONS));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["retire", "keep", "error"]));
    expect(new Set(expected.filter((r) => r.outcome === "error").map((r) => (r.error as string).replace(/ \(akm said:.*$/, "")))).toEqual(
      new Set([
        "akm paired the notes but its judge gave no verdict",
        "improve printed no pair pass result. Does this akm have consolidate's pair pass?",
        "akm made 2 retire proposals for one pair",
        "akm retired memories/some-other-note, which is not one of the two notes",
        "JSON Parse error: Unexpected EOF",
        "akm improve failed (exit 70): LLM request failed: <MODEL_BASE_URL>/chat/completions refused",
        "akm improve timed out after 1800s",
      ]),
    );
    expect(expected.filter((r) => r.timed_out === true)).toHaveLength(1);
    expect(expected.some((r) => r.retried === 2)).toBe(true);
    expect(expected.some((r) => r.outcome === "retire" && r.only_in_retired === null)).toBe(true); // an akm build that records no claim lists
    expect(raw.some((l) => l.raw.pair_pass?.pairsConsidered === 0)).toBe(true); // a pair akm never paired
    expect(raw.some((l) => l.raw.retire_proposals?.length === 0 && l.raw.pair_pass !== null)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines(GOLDEN, "raw.jsonl");
    const expected = lines(GOLDEN, "expected.jsonl");
    const row = (note: string, id?: string) => expected.find((_, i) => raw[i].note === note && (id === undefined || raw[i].case === id));
    expect(row("akm retires the older note of a duplicate and stages the retirement")).toMatchObject({ outcome: "retire", retired: "a", safe: true, staged: true, judged_as: "duplicate", only_in_retired: [], only_in_successor: [] });
    expect(row("akm retires the older note b of a duplicate, and the retirement waits")).toMatchObject({ retired: "b", safe: true, staged: false });
    expect(row("akm retires the note a that holds nothing the other lacks (safe)")).toMatchObject({ safe: true, judged_as: "subsumed", only_in_successor: ["the job id is logged"] });
    expect(row("akm retires the note b that has a claim of its own (unsafe)")).toMatchObject({ retired: "b", safe: false });
    expect(row("akm retires the note a that holds a claim of its own and stages it (unsafe)")).toMatchObject({ retired: "a", safe: false, staged: true });
    expect(row("akm retires one of two notes that contradict each other (unsafe)")).toMatchObject({ outcome: "retire", safe: false, safe_sides: [] });
    expect(row("the judge calls the duplicates an overlap and akm keeps both")).toMatchObject({ outcome: "keep", paired: true, judged_as: "overlap", retired: null, safe: null });
    expect(row("akm never pairs notes on different subjects")).toMatchObject({ outcome: "keep", paired: false, judged_as: null });
    expect(row("the promote pass proposes a promotion and no retirement")).toMatchObject({ outcome: "keep", paired: true });
    expect(row("the judge gives no verdict: the endpoint is down")?.error).toBe("akm paired the notes but its judge gave no verdict (akm said: Network error: Unable to connect to <MODEL_BASE_URL>/chat/completions)");
    expect(row("the judge gives no verdict: the endpoint is down")?.served).toEqual({}); // every call failed, so none was answered
    expect(row("akm retires the older note after the endpoint turned the case away twice")).toMatchObject({ outcome: "retire", retried: 2 });
    // the model names the endpoint reported are kept on every row that has a run result
    expect(row("akm retires the older note of a duplicate and stages the retirement")?.served).toEqual({ "qwen3-27b": 3 });
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const cases = lines(GOLDEN, "cases.jsonl");
    const rows = lines(GOLDEN, "raw.jsonl").map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows) as any;
    expect(summary).toMatchObject({ n_run: 25, n_errored: 8, n_scored: 17, timeouts: 1 });
    expect(summary.n_paired).toBe(rows.filter((r: any) => r.outcome !== "error" && r.paired).length);
    expect(summary.metrics.unsafe.n).toBe(rows.filter((r: any) => r.outcome === "retire" && r.safe === false).length);
    expect(summary.metrics.unsafe.of).toBe(17);
    expect(summary.served_models).toEqual({ "qwen3-27b": 57 }); // 19 rows have a usage report, with 3 answered calls each
  });
});

describe("the golden rows of the pool scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, POOL, POOL_OPTIONS);
    expect(goldenProblems(MEASUREMENT, POOL, POOL_OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every verdict, a run that failed, a result with no pair pass and a retirement outside the pool", () => {
    const raw = lines(POOL, "raw.jsonl");
    const expected = lines(POOL, "expected.jsonl");
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
    expect(new Set(expected.map((r) => r.kind))).toEqual(new Set(KINDS));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["kept", "safe", "unsafe", "wrong_successor", "error"]));
    expect(new Set(expected.flatMap((r) => r.retirements.map((x: any) => x.verdict)))).toEqual(new Set(["safe", "unsafe", "wrong_successor"]));
    expect(new Set(expected.filter((r) => r.outcome === "error").map((r) => r.error))).toEqual(
      new Set([
        "improve printed no pair pass result. Does this akm have consolidate's pair pass?",
        "akm retired memories/a-note-that-is-not-in-the-pool, which is not a note of the pool",
        "akm retired memories/jessamy-oncall-handover, which is not a note of the cluster single-01",
        "akm improve timed out after 1.5s",
        "akm improve failed (exit 78): the config names an engine that does not exist",
      ]),
    );
    expect(expected.filter((r) => r.timed_out === true)).toHaveLength(1);
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines(POOL, "raw.jsonl");
    const expected = lines(POOL, "expected.jsonl");
    const row = (note: string) => expected.find((_, i) => raw[i].note === note);
    expect(row("akm retires one note of a duplicate pair for the other and stages it (safe)")).toMatchObject({ outcome: "safe", retirements: [{ verdict: "safe", staged: true, judged_as: "duplicate" }] });
    expect(row("akm retires a duplicate for a note of another cluster (wrong successor)")).toMatchObject({ outcome: "wrong_successor" });
    expect(row("akm retires two notes of a triple for the third (safe, one staged)")?.retirements).toHaveLength(2);
    expect(row("akm retires the note with the extra claim and stages it (unsafe)")).toMatchObject({ outcome: "unsafe", retirements: [{ verdict: "unsafe", staged: true }] });
    expect(row("akm retires a single note, which holds a claim no other note has (unsafe)")).toMatchObject({ outcome: "unsafe", retirements: [{ successor: null, verdict: "unsafe" }] });
    expect(row("akm leaves a contradiction alone")).toMatchObject({ outcome: "kept", retirements: [] });
  });

  test("the summary takes its counts and metrics from the rows of one run", () => {
    const cases = lines(POOL, "cases.jsonl");
    const raw = lines(POOL, "raw.jsonl");
    const good = raw.slice(0, 13).map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(good) as any;
    expect(summary).toMatchObject({ n_run: 1, n_scored: 1, n_errored: 0, n_paired: 39, seconds: 271.4, status: "complete", aborted_reason: null });
    expect(summary.served_models).toEqual({ "qwen3-27b": 60, "qwen3-27b-gateway": 12 });
    expect(summary.metrics.pairs).toEqual({ initiators: 80, judged: 39, considered: 41, failed: 2, labels: { duplicate: 13, subsumed: 6, supersedes: 5, overlap: 9, contradicts: 2, unrelated: 4 } });
    expect(summary.metrics.calls).toEqual({ calls: 73, failures: 1, prompt_tokens: 83200, completion_tokens: 7100 });
    expect(summary.metrics.unsafe).toEqual({ n: 4, of: 11, staged: 2 });
    expect(summary.metrics.wrong_successor).toBe(1);
    expect(summary.metrics.anti_collapse_injected).toBe(4);
    const failed = raw.slice(-1).map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    expect(MEASUREMENT.summarize(failed)).toMatchObject({ n_errored: 1, n_scored: 0, metrics: null, status: "aborted", aborted_reason: "akm improve failed (exit 78): the config names an engine that does not exist" });
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder. */
  function withCopy<T>(from: string, run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "consolidate-golden-"));
    try {
      cpSync(from, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), safe: false }) };
    const problems = withCopy(GOLDEN, (dir) => goldenProblems(changed, dir, OPTIONS));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(duplicate-01, "akm retires the older note of a duplicate and stages the retirement"\) is not the expected one: safe: expected true, got false/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy(GOLDEN, (dir) => goldenProblems(refactored, dir, OPTIONS))).toEqual([]);
    expect(withCopy(POOL, (dir) => goldenProblems(refactored, dir, POOL_OPTIONS))).toEqual([]);
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    for (const [from, options] of [[GOLDEN, OPTIONS], [POOL, POOL_OPTIONS]] as const) {
      const problems = withCopy(from, (dir) => {
        writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: live + 1 }));
        return goldenProblems(MEASUREMENT, dir, options);
      });
      expect(problems).toEqual([`scorer.json is for scorer version ${live + 1} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
    }
  });

  test("a raw output the scorer cannot read is named", () => {
    const problems = withCopy(GOLDEN, (dir) => {
      const raw = lines(dir, "raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { seconds: 1 } }, ...raw.slice(1)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems[0]).toBe('raw.jsonl line 1 (duplicate-01, "akm retires the older note of a duplicate and stages the retirement"): the raw output lacks pair_pass, retire_proposals, usage');
  });
});
