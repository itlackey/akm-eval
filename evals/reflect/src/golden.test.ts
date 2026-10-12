import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { CLASSES } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: ten cases, one of each class, with 59 raw outputs for them. Each is a realistic answer of a model: the
// right one, and each way to get it wrong (no change, a rewrite of another field, an edit of the body, an invented number, a refusal, an
// unusable reply, an error). cases.jsonl is a copy of ten cases of assets/cases.jsonl, so a change to the corpus does not move them. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const OPTIONS = { omit: ["proposal"] };
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, OPTIONS);
    expect(goldenProblems(MEASUREMENT, GOLDEN, OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every class, every outcome, every check and a timeout", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(new Set(expected.map((r) => r.class))).toEqual(new Set(CLASSES));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["proposal", "none", "refused", "unusable", "error"]));
    expect(new Set(expected.flatMap((r) => Object.keys(r.checks ?? {})))).toEqual(new Set(["body_kept", "defect_fixed", "no_extra_change", "no_invented", "not_current"]));
    expect(new Set(expected.flatMap((r) => Object.entries(r.checks ?? {}).filter(([, ok]) => ok === false).map(([name]) => name)))).toEqual(new Set(["body_kept", "defect_fixed", "no_extra_change", "no_invented", "not_current"]));
    expect(expected.some((r) => r.timed_out === true)).toBe(true);
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would: the right answer is correct, and each way to get it wrong is not", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const verdict = (note: string, id?: string) => expected.filter((_, i) => raw[i].note === note && (id === undefined || raw[i].case === id)).map((r) => r.correct);
    expect(verdict("the model restores what the injection took away")).toEqual([true, true, true, true, true, true]);
    expect(verdict("the model proposes no change")).toEqual([false, false, false, false, false, false]); // a defect left alone is a miss
    expect(verdict("the model leaves the note alone")).toEqual([true, true, true, true]); // a control left alone is right
    expect(verdict("the model fixes the defect and rewrites another field too")).toEqual([false, false, false, false, false, false]);
    expect(verdict("the model fixes the defect and edits the body")).toEqual([false, false, false, false, false, false]);
    expect(verdict("the model fixes the description but invents a number")).toEqual([false, false, false, false]);
    expect(verdict("the model rewrites the description and the when_to_use")).toEqual([false, false, false, false]);
    expect(verdict("the model adds the term the feedback asks for")).toEqual([false]);
    expect(verdict("the model says the note records a past version")).toEqual([true]);
    // a wrong edit that the scorer let through before #59: the meaning reversed or words added at the stray period, a historical note offered for current work
    expect(verdict("the model repairs the break and reverses the meaning")).toEqual([false]);
    expect(verdict("the model repairs the break and adds a clause")).toEqual([false]);
    expect(verdict("the model joins the break with a comma and changes nothing else")).toEqual([true]);
    expect(verdict("the model offers the note as the current way, naming a version it records")).toEqual([false]);
    expect(verdict("the model says the note replaces the old approach")).toEqual([false]);
    expect(verdict("the model names the versions and says the note is not for current work")).toEqual([true]);
    expect(verdict("the model says the note is superseded")).toEqual([true]);
    expect(verdict("the model names the version the note records and nothing else")).toEqual([true]);
    // an unusable answer is never correct, and an error has no verdict
    expect(expected.filter((r) => r.outcome === "unusable").map((r) => r.correct)).toEqual([false, false]);
    // a refused edit leaves the note as it was: a miss for a defect, right for a control (#57)
    expect(expected.filter((r) => r.outcome === "refused").map((r) => [r.class, r.correct])).toEqual([["description-period", false], ["when-to-use-missing", false], ["retrieval-miss", true], ["unsupported-ask", true], ["historical", true]]);
    // a retrieval check that could not grade is an error, not a refusal (#58): it has no verdict, and a timeout is one of the timeouts
    const graded = expected.filter((_, i) => /could not grade/.test(raw[i].raw.reason));
    expect(graded.map((r) => [r.class, r.outcome, r.correct, r.timed_out ?? false])).toEqual([["description-quote", "error", null, true], ["title-missing", "error", null, false]]);
    expect(expected.filter((r) => r.outcome === "error").map((r) => r.correct)).toEqual([null, null, null, null]);
    // the body check is the one that fails when the body is edited, and only that one
    const edited = expected.find((_, i) => raw[i].note === "the model fixes the defect and edits the body");
    expect(Object.entries(edited.checks).filter(([, ok]) => ok === false).map(([name]) => name)).toEqual(["body_kept"]);
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const cases = lines("cases.jsonl");
    const raw = lines("raw.jsonl");
    const rows = raw.map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows);
    expect(summary).toMatchObject({ n_run: 59, n_scored: 55, n_errored: 4, timeouts: 2, served: { "qwen3-27b": 55 } });
    expect(summary.metrics.refused).toEqual({ filter: 2, judge: 2, retrieval: 1, other: 0 }); // the two checks that could not grade are not refusals
    expect(summary.metrics.defects).toMatchObject({ correct: 7 }); // the six right answers and the stray period joined by a comma
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "reflect-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), correct: raw.outcome === "none" ? !MEASUREMENT.score(c, raw).correct : MEASUREMENT.score(c, raw).correct }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir, OPTIONS));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 2 \(description-period-01, "the model proposes no change"\) is not the expected one: correct: expected false, got true/);
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
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { outcome: "proposal", reason: "", seconds: 1 } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (description-period-01, "the model restores what the injection took away"): the raw output lacks proposal',
      'raw.jsonl line 2 (no-such-case, "the model proposes no change"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir, OPTIONS)))[0]).toContain("expected.jsonl is missing");
  });
});
