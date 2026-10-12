import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { PROCESSES } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: eight cases, one or two of each process, with 46 raw outputs for them. The files that akm wrote (a derived
// memory, an enriched memory, a repair proposal, a session asset) and the promotions it queued are those of akm 0.9.26, run against a scripted
// model that answers each way a model can: the right answer, and each way to get it wrong (a fact or the date dropped, a date invented, the wrong
// shape, a trigger that is not concrete, a promotion too many, a reply in prose). The errors and the timeout are written by hand, since a dead
// endpoint stops akm before the case. cases.jsonl is a copy of eight cases of assets/cases.json, so a change to the corpus does not move them.
// See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const OPTIONS = { omit: ["derived", "written", "proposal", "asset"] };
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, OPTIONS);
    expect(goldenProblems(MEASUREMENT, GOLDEN, OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every process, every outcome, a wrong shape, a failed check and a timeout", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(new Set(expected.map((r) => r.process))).toEqual(new Set(PROCESSES));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["output", "unusable", "error"]));
    expect(expected.some((r) => r.outcome === "output" && r.structure === false)).toBe(true);
    expect(expected.some((r) => r.outcome === "output" && r.structure === true && Object.values(r.checks).includes(false))).toBe(true);
    expect(expected.some((r) => r.timed_out === true)).toBe(true);
    for (const process of PROCESSES) {
      const mine = expected.filter((r) => r.process === process && r.outcome !== "error");
      expect(mine.some((r) => r.correct === true)).toBe(true);
      expect(mine.some((r) => r.correct === false)).toBe(true);
    }
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would: the right answer is correct, and each way to get it wrong is not", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const verdict = (note: string) => expected.filter((_, i) => raw[i].note === note).map((r) => r.correct);
    const failed = (note: string) => expected.filter((_, i) => raw[i].note === note).map((r) => Object.entries(r.checks ?? {}).filter(([, ok]) => ok === false).map(([name]) => name));
    // every right answer is correct
    for (const note of ["the model keeps every fact and the date", "the model keeps every fact", "the model gives the date the memory writes", "the model gives no date, as the memory writes none", "the model repairs both fields from the body", "the summary keeps the identifiers and the topics list them", "the model promotes the one stable fact", "the model promotes the observation of the signature boundary"]) {
      expect(verdict(note)).toEqual([true]);
    }
    // a fact lost, a date lost or invented, the shape wrong: each fails, on the check that names it
    expect(failed("the model drops the date")).toEqual([["retains explicit date"]]);
    expect(failed("the model leaves out the manifest and the blob")).toEqual([["retains manifest", "retains blob"]]);
    expect(failed("the model invents a date the memory does not hold")).toEqual([["does not invent 2026-02-12"]]);
    expect(failed("the model drops the Worker Service")).toEqual([["retains worker service"]]);
    expect(verdict("the model gives two tags and two search hints")).toEqual([false]);
    expect(failed("the model gives two tags and two search hints")).toEqual([[]]); // the facts are all there: it is the shape that fails
    expect(failed("the model leaves the date out")).toEqual([["preserves explicit date"]]);
    expect(failed("the model gives another date")).toEqual([["preserves explicit date"]]);
    expect(failed("the model invents a date")).toEqual([["does not invent an observation date"]]);
    expect(verdict("the model gives an empty date")).toEqual([true]); // an empty date is no date
    expect(verdict("the model tags in capitals")).toEqual([false]);
    expect(verdict("the model gives six tags")).toEqual([false]);
    expect(verdict("the model gives no tags")).toEqual([false]);
    expect(failed("the model describes something the lesson does not say")).toEqual([["generated fields are grounded in the body"]]);
    expect(failed("the model gives a trigger that is not concrete")).toEqual([["trigger is concrete"]]);
    expect(verdict("the model gives a description of a few words")).toEqual([false]);
    expect(failed("the summary leaves out the canary")).toEqual([["summary retains relay-canary-184", "topics include relay-canary-184"]]);
    expect(failed("the topics miss worker-stable")).toEqual([["topics include worker-stable"]]);
    expect(verdict("the summary is a sentence")).toEqual([false]);
    expect(failed("the summary says the output was forced")).toEqual([["summary omits forced-output"]]);
    expect(failed("the model promotes nothing")).toEqual([["promotes memories/signed-artifacts", "no extra or missing promotions"]]);
    expect(failed("the model also promotes the operator's preference")).toEqual([["leaves protected memories/operator-preference untouched", "no extra or missing promotions"]]);
    expect(failed("the model also promotes a current note")).toEqual([["no extra or missing promotions"]]);
    // the full pool is not strict: two promotions more are allowed, the protected preference is not
    expect(verdict("the model promotes the observation and two more")).toEqual([true]);
    expect(failed("the model promotes the protected preference and not the observation")).toEqual([["promotes memories/artifact-signing-observation", "leaves protected memories/operator-preference untouched"]]);
    // a reply akm could not use is never correct, and an error has no verdict
    expect(expected.filter((r) => r.outcome === "unusable").map((r) => r.correct)).toEqual([false, false, false, false, false, false, false]);
    expect(expected.filter((r) => r.outcome === "error").map((r) => r.correct)).toEqual([null, null, null, null, null, null]);
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const cases = lines("cases.jsonl");
    const raw = lines("raw.jsonl");
    const rows = raw.map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows);
    expect(summary).toMatchObject({ n_run: 46, n_scored: 40, n_errored: 6, timeouts: 1, served: { "scripted-model": 23 } });
    expect(summary.metrics.valid_output.n).toBe(40);
    expect(summary.metrics.case_pass.n).toBe(40);
    expect(summary.metrics.by_process["memory-inference"]).toMatchObject({ n: 9, outcomes: { output: 7, unusable: 2, error: 2 } });
    expect(summary.metrics.by_process["consolidate-promote"]?.outcomes).toEqual({ output: 7, unusable: 1, error: 1 });
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "bakeoff-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), correct: raw.outcome === "unusable" ? true : MEASUREMENT.score(c, raw).correct }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir, OPTIONS));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 5 \(infer-checkpoint-memory, "the model answers in prose"\) is not the expected one: correct: expected false, got true/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir, OPTIONS))).toEqual([]);
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    const problems = withCopy((dir) => {
      writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: live + 1 }));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems).toEqual([`scorer.json is for scorer version ${live + 1} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
  });

  test("a raw output the scorer cannot read, a case that is not there and a missing file are named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { outcome: "output", reason: "", seconds: 1 } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (infer-checkpoint-memory, "the model keeps every fact and the date"): the raw output lacks the output (derived, written, proposal, asset or planned)',
      'raw.jsonl line 2 (no-such-case, "the model drops the date"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir, OPTIONS)))[0]).toContain("expected.jsonl is missing");
  });
});
