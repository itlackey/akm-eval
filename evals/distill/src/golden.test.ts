import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { CLASSES } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: twelve of the public cases, with 52 raw outputs for them. Each is a realistic answer of distill on akm
// 0.9.26: the right one, and each way to get it wrong (a lesson that over-claims, turns the advice round or leaves a fact out, a lesson
// where none is wanted, an update that drops a line or adds a claim, a judge that rejects, a skip, a timeout, an unreachable endpoint,
// an empty answer). cases.jsonl is a copy of those cases with the memories they are measured against, so a change to the corpus does not
// move the golden files. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const OPTIONS = { omit: ["improve", "proposals"] };
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, OPTIONS);
    expect(goldenProblems(MEASUREMENT, GOLDEN, OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every class, every outcome and verdict, every check of an update, a timeout and an empty answer", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(new Set(expected.map((r) => r.class))).toEqual(new Set(CLASSES));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["lesson", "update", "skipped", "rejected", "invalid", "error"]));
    expect(new Set(expected.map((r) => r.verdict))).toEqual(new Set(["good", "bad", "missed", "right", "wrong", "error"]));
    const failedChecks = expected.flatMap((r) => Object.entries(r.checks ?? {}).filter(([, ok]) => ok === false).map(([name]) => name));
    expect(new Set(failedChecks)).toEqual(new Set(["update_proposed", "existing_kept", "new_facts", "no_extra_claims", "no_new_lesson"]));
    expect(expected.some((r) => r.timed_out === true)).toBe(true);
    expect(raw.some((l) => l.note === "akm printed no distill action")).toBe(true);
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would: the right answer passes, and each way to get it wrong does not", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const verdicts = (note: string) => expected.filter((_, i) => raw[i].note === note).map((r) => r.verdict);
    expect(verdicts("distill queues a lesson that states the facts and claims no more")).toEqual(["good", "good"]);
    expect(verdicts("distill queues a lesson that claims more than the memory")).toEqual(["bad", "bad"]);
    expect(verdicts("distill queues a lesson that turns the memory's advice round")).toEqual(["bad"]);
    expect(verdicts("distill queues a lesson that leaves out the cause")).toEqual(["bad"]);
    expect(verdicts("distill queues a lesson that says only that gh pr list has the same default")).toEqual(["bad"]);
    expect(verdicts("distill queues a lesson that says both layouts were verified")).toEqual(["bad"]);
    expect(verdicts("distill proposes an update that keeps every line and adds the new facts")).toEqual(["right", "right", "right"]);
    expect(verdicts("the update adds a claim the memory does not make")).toEqual(["bad", "bad"]);
    expect(verdicts("the update turns the grouping round")).toEqual(["bad"]);
    expect(verdicts("the update drops a line of the existing lesson")).toEqual(["bad"]);
    expect(verdicts("the update adds nothing the memory knows")).toEqual(["bad"]);
    expect(verdicts("distill writes a new lesson in place of an update")).toEqual(["bad"]);
    // a lesson that is rejected, skipped or invalid is nothing queued: missed where a lesson was wanted, right where it was not
    expect(verdicts("distill finds nothing reusable in the memory")).toEqual(["missed"]);
    expect(verdicts("the lesson fails akm's validation")).toEqual(["missed"]);
    expect(verdicts("distill skips the memory")).toEqual(["missed"]);
    expect(verdicts("distill skips a dated status")).toEqual(["right"]);
    expect(verdicts("distill queues a lesson for a dated status")).toEqual(["wrong"]);
    expect(verdicts("a lesson for a dated status goes to review and a person rejects it")).toEqual(["wrong"]); // the queue decides, in whatever state
    expect(verdicts("distill writes a new lesson for a point the library holds under another name")).toEqual(["wrong"]);
    // a failed case has no verdict, whatever way it failed
    expect(verdicts("akm ran past its time limit")).toEqual(["error"]);
    expect(verdicts("the endpoint refused the connection")).toEqual(["error"]);
    expect(verdicts("akm printed no distill action")).toEqual(["error"]);
    const timeout = expected.find((_, i) => raw[i].note === "akm ran past its time limit");
    expect(timeout).toMatchObject({ error: "akm exited 137: akm timed out after 900s", timed_out: true, served: [], calls: null });
    expect(expected.find((_, i) => raw[i].note === "the endpoint refused the connection").error).not.toContain("127.0.0.1:8080/v1"); // the endpoint is written as <MODEL_BASE_URL>
    // the check that fails when an update drops a line is that one, and only that one
    const dropped = expected.find((_, i) => raw[i].note === "the update drops a line of the existing lesson");
    expect(Object.entries(dropped.checks).filter(([, ok]) => ok === false).map(([name]) => name)).toEqual(["existing_kept"]);
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const cases = lines("cases.jsonl");
    const raw = lines("raw.jsonl");
    const rows = raw.map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows);
    expect(summary).toMatchObject({ n_run: 52, n_scored: 49, n_errored: 3, timeouts: 1, served_models: ["qwen3-27b"] });
    expect(summary.metrics.lesson_updates).toMatchObject({ n: 13, right: 6, checks: { update_proposed: 11, existing_kept: 10, new_facts: 10, no_extra_claims: 8, no_new_lesson: 12 } });
    expect(summary.metrics.good_lessons).toMatchObject({ n: 27, good: 13 });
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "distill-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = {
      ...MEASUREMENT,
      score: (c, raw) => {
        const row = MEASUREMENT.score(c, raw);
        return row.verdict === "good" ? { ...row, verdict: "missed" } : row;
      },
    };
    const problems = withCopy((dir) => goldenProblems(changed, dir, OPTIONS));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(lesson-01, "distill queues a lesson that states the facts and claims no more"\) is not the expected one: verdict: expected "good", got "missed"/);
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
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { seconds: 1 } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (lesson-01, "distill queues a lesson that states the facts and claims no more"): the raw output lacks improve, proposals',
      'raw.jsonl line 2 (no-such-case, "distill queues a lesson that claims more than the memory"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir, OPTIONS)))[0]).toContain("expected.jsonl is missing");
  });
});
