import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { CLASSES } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: twelve of the public cases, with 63 raw outputs for them. Each is a realistic answer of distill on akm
// 0.9.26: the right one, and each way to get it wrong (a lesson that over-claims, turns the advice round or leaves a fact out, a lesson
// where none is wanted, an update that drops a line or adds a claim, a judge that rejects, a skip, a timeout, an unreachable endpoint,
// an empty answer), the lessons that hold a phrase only behind a negation over a verb the shared rule does not list, and two answers of
// akm 0.9.31, captured on 2026-10-12: a lesson with tags, whose judge scores `reusable` where 0.9.26 scored `novelty`, and a skip because the
// writer answered `decision: none`. cases.jsonl is a copy of those cases with the memories they are measured against, so a change to the corpus does not
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
    expect(new Set(failedChecks)).toEqual(new Set(["update_proposed", "existing_kept", "new_facts", "no_extra_claims", "not_copied", "no_new_lesson"]));
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
    // the memory pasted back is not a lesson (#55): as the file, as its body under a description and a when_to_use, and appended to the old lesson
    expect(verdicts("the memory pasted back as the lesson")).toEqual(["bad", "bad", "bad", "bad"]);
    expect(verdicts("the memory's body as the lesson, under a description and a when_to_use")).toEqual(["bad"]);
    expect(verdicts("the existing lesson with the memory appended")).toEqual(["bad", "bad", "bad"]);
    const copies = expected.filter((_, i) => raw[i].note.includes("the memory pasted back") || raw[i].note.includes("the memory's body as the lesson"));
    expect(copies.map((r) => r.copied)).toEqual([1, 1, 1, 1, 1]);
    expect(copies.map((r) => [r.missing, r.forbidden, r.contradicted])).toEqual(copies.map(() => [[], [], []])); // it states the facts and claims nothing else: only the copy fails it
    const appended = expected.filter((_, i) => raw[i].note === "the existing lesson with the memory appended");
    for (const r of appended) expect(Object.entries(r.checks).filter(([, ok]) => ok === false).map(([name]) => name)).toEqual(["not_copied"]);
    // a lesson that repeats less than three quarters of its memory still passes
    const goods = expected.filter((_, i) => raw[i].note === "distill queues a lesson that states the facts and claims no more");
    expect(Math.max(...goods.map((r) => r.copied))).toBeLessThan(0.5);
    // a doubt excuses a claim only when it governs it (#56): a hedge in another clause, or after the claim and about something else, does not
    expect(verdicts("the lesson makes the claim and says the fix could save a rebuild")).toEqual(["bad"]);
    expect(verdicts("the lesson makes the claim and puts a condition after it")).toEqual(["bad"]);
    expect(verdicts("the lesson makes the claim after a permission that is not a doubt about it")).toEqual(["bad"]);
    const hedged = expected.filter((_, i) => /^the lesson makes the claim (and says the fix could|and puts a condition|after a permission)/.test(raw[i].note));
    expect(hedged.map((r) => r.forbidden)).toEqual([["works * all * layout"], ["works * all * layout"], ["works * all * layout"]]);
    expect(hedged.map((r) => [r.missing, r.contradicted])).toEqual([[[], []], [[], []], [[], []]]); // the claim is all that is wrong with them
    // and a doubt that governs it still does
    expect(verdicts("the lesson doubts the claim it makes, in the same clause")).toEqual(["good"]);
    expect(verdicts("the lesson says it may be that the fix works on all layouts")).toEqual(["good"]);
    expect(verdicts("the lesson makes the claim and says in a clause of its own that it is unconfirmed")).toEqual(["good"]);
    // a negation over a verb the shared rule does not list: the verdict is as the word order has it, and the phrase is named under ambiguous (#45)
    const read = (note: string) => expected.filter((_, i) => raw[i].note === note).map((r) => [r.verdict, r.missing, r.contradicted, r.forbidden, r.ambiguous]);
    expect(read("the lesson holds the advice behind do not think we should")).toEqual([["good", [], [], [], ["=wait for networkidle"]]]);
    expect(read("the lesson holds the reversal behind did not ignore")).toEqual([["good", [], [], [], ["=wait for networkidle"]]]); // the lesson recommends what the memory advises against, and is scored good
    expect(read("the lesson holds the reversal behind a verdict after it")).toEqual([["good", [], [], [], ["=wait for networkidle"]]]);
    expect(read("the lesson states the action only behind do not think we should")).toEqual([["good", [], [], [], ["+wait * heading"]]]);
    expect(read("the lesson leaves the action behind a verdict after it")).toEqual([["bad", ["+wait * heading"], [], [], ["+wait * heading"]]]);
    expect(read("the lesson holds the claim behind did not dispute")).toEqual([["good", [], [], [], ["works * all * layout"]]]);
    // a claim hidden behind "no breaking changes so", beside one that is made in plain words
    expect(read("distill queues a lesson that says the upgrade fixes every service")).toEqual([["bad", ["report-service", "invoice", "deprecation"], [], ["no breaking"], ["every service * can upgrade"]]]);
    // no other row is flagged, and none of the rows that were here before changed in any other field
    expect(expected.filter((_, i) => !/behind (do not think|did not ignore|a verdict|did not dispute)|the upgrade fixes every service/.test(raw[i].note)).every((r) => r.ambiguous.length === 0)).toBe(true);
    // akm 0.9.31 (the akm range of the README): the same checks read its lesson, with tags in the frontmatter, and its skip when the writer says none
    const newer = expected.filter((_, i) => raw[i].note.startsWith("akm 0.9.31"));
    expect(newer.map((r) => [r.verdict, r.outcome, r.detail, r.scores])).toEqual([
      ["good", "lesson", "deferred/distill-review: The lesson states what the memory says.", { reusable: 5, nonRedundancy: 5, grounding: 5 }],
      ["missed", "skipped", "nothing_reusable", null],
    ]);
    expect(newer[0].lesson).not.toContain("tags"); // the tags are labels and not text: the checks read the description, the when_to_use and the body
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
    expect(summary).toMatchObject({ n_run: 63, n_scored: 60, n_errored: 3, timeouts: 1, served_models: ["qwen3-27b"] });
    expect(summary.metrics.lesson_updates).toMatchObject({ n: 13, right: 3, checks: { update_proposed: 11, existing_kept: 10, new_facts: 10, no_extra_claims: 8, not_copied: 8, no_new_lesson: 12 } });
    expect(summary.metrics.good_lessons).toMatchObject({ n: 38, good: 14, ambiguous: 7 }); // the six lessons of #45 and the bad one of claim-03
    expect(summary.metrics.lesson_updates.ambiguous).toBe(0);
    expect(summary.metrics.bad_by.forbidden_claim).toBe(7);
    expect(summary.metrics.bad_by.copied).toBe(5);
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
