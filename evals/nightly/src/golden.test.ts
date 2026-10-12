import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { KINDS } from "./items.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: 21 items of the public night, one or more of each kind, with 42 raw outputs. Each is what the collector stores of one
// night for one item, in the shape akm 0.9.26 prints it: the right night, and each way for it to go wrong (a note retired the wrong way, a lesson accepted,
// a fix applied, a note edited, a proposal left in the wrong state, a model call that failed, a budget that ran out). cases.jsonl is a copy of those items, so a
// change to the corpus does not move them. See lib/golden.ts.
//
// expected.jsonl leaves out the copies of the raw output that a row keeps so that it can be scored again: what is left is the row the eval scored before
// it was split into a scorer and a collector (the code at 3ae7c07 gives these rows for the same nights).
const GOLDEN = join(import.meta.dir, "..", "golden");
const OPTIONS = { omit: ["before", "after", "proposals", "actions", "night"] };
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, OPTIONS);
    expect(goldenProblems(MEASUREMENT, GOLDEN, OPTIONS)).toEqual([]);
  });

  test("the raw outputs cover every kind of item, right and wrong nights, harm, a model call that failed and the end of the budget", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
    expect(new Set(expected.map((r) => r.kind))).toEqual(new Set(KINDS));
    expect(expected.some((r) => r.ok)).toBe(true);
    expect(expected.some((r) => !r.ok && !r.harm)).toBe(true);
    expect(expected.some((r) => r.harm)).toBe(true);
    expect(expected.filter((r) => r.error).map((r) => r.error)).toEqual([
      "llm_error: LLM request failed: <MODEL_BASE_URL>/chat/completions refused",
      "the model call failed",
      "timeout: improve wall-clock budget exhausted",
      "LLM request failed: <MODEL_BASE_URL>/chat/completions refused",
    ]);
    expect(raw.some((l) => l.raw.night.lane === null)).toBe(true);
    expect(raw.some((l) => l.raw.night.lane?.refs.length > 0)).toBe(true);
    expect(raw.some((l) => l.raw.night.outside.length > 0)).toBe(true);
    expect(JSON.stringify(raw)).not.toContain("localhost:8080"); // akm names the endpoint in some errors, and the raw output does not carry it
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const row = (note: string) => expected[raw.findIndex((l) => l.note === note)];
    expect(row("the pair judge stages the duplicate and the drain retires the older note a")).toMatchObject({ ok: true, harm: false, state: "retired a" });
    expect(row("akm keeps both duplicates")).toMatchObject({ ok: false, harm: false, checks: { right_outcome: false }, state: "both notes kept" });
    expect(row("the drain retires the older note b and the survivor was edited too")).toMatchObject({ ok: false, harm: true, checks: { survivors_unchanged: false } });
    expect(row("the retirement of the note with nothing of its own is proposed and waits")).toMatchObject({ ok: true, state: "retirement of b proposed, waiting" });
    expect(row("the retirement of the note with the extra claim is proposed and waits")).toMatchObject({ ok: false, harm: false, checks: { no_unsafe_proposal: false } }); // a proposal waits for a person, so it is a miss and not harm
    expect(row("the drain retires the note with the extra claim (both are lost)")).toMatchObject({ ok: false, harm: true, checks: { no_unsafe_retirement: false, note_kept: false } });
    expect(row("reflect fixes the description and the drain accepts the fix")).toMatchObject({ ok: true, state: expect.stringContaining("edited by the drain (description)") });
    expect(row("reflect proposes the fix and it waits")).toMatchObject({ ok: false, checks: { defect_fixed: false } });
    expect(row("reflect rewrites the body of a note with a copied frontmatter")).toMatchObject({ ok: false, harm: true, checks: { body_kept: false } });
    expect(row("distill queues a good lesson for review")).toMatchObject({ ok: true, state: "lesson pending, deferred/distill-review" });
    expect(row("the lesson is accepted and the lesson file written")).toMatchObject({ ok: false, harm: true, checks: { lesson_not_accepted: false } });
    expect(row("distill queues a lesson for a memory that needs none")).toMatchObject({ ok: false, checks: { no_lesson: false } });
    expect(row("the exact fix is queued and waits")).toMatchObject({ ok: true, checks: { fix_queued: true, fix_waits: true } });
    expect(row("the exact fix is accepted by the drain")).toMatchObject({ ok: false, checks: { fix_queued: true, fix_waits: false } });
    expect(row("reflect edits a note it had no reason to touch")).toMatchObject({ ok: false, harm: true, checks: { unchanged: false } });
    expect(row("the lane plans the note and leaves a pending fix for a person")).toMatchObject({ ok: true, checks: { fix_proposed: true, unchanged: true } });
    expect(row("the note was edited without a person")).toMatchObject({ ok: false, harm: true, checks: { unchanged: false }, state: "edited without a person (accepted)" });
    expect(row("the model call fails: the endpoint is down")).toMatchObject({ ok: false, checks: { no_error: false }, error: "llm_error: LLM request failed: <MODEL_BASE_URL>/chat/completions refused" });
  });

  test("the summary takes its counts and metrics from the rows, and the whole night's part from the first", () => {
    const cases = lines("cases.jsonl");
    const raw = lines("raw.jsonl");
    const rows = raw.slice(0, 9).map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows) as any;
    expect(summary.n_errored).toBe(0);
    expect(summary.outside_changed).toEqual([]);
    expect(summary.metrics.items.n).toBe(9);
    expect(summary.metrics.calls).toEqual({ n: 19, failures: 0 });
    const last = raw.findIndex((l) => l.case === "unrelated-06");
    const stray = MEASUREMENT.summarize([MEASUREMENT.score(cases.find((c) => c.id === "unrelated-06"), (MEASUREMENT.rawOf({ id: "unrelated-06", ...raw[last].raw }) as { raw: any }).raw)]) as any;
    expect(stray.outside_changed).toEqual(["lessons/stray-lesson.md"]);
    expect(stray.metrics.harm.outside_changed).toBe(1);
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "nightly-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), harm: !MEASUREMENT.score(c, raw).harm }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir, OPTIONS));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(duplicate-01, "the pair judge stages the duplicate and the drain retires the older note a"\) is not the expected one: harm: expected false, got true/);
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

  test("a raw output the scorer cannot read is named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { before: {}, proposals: [] } }, ...raw.slice(1)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir, OPTIONS);
    });
    expect(problems[0]).toBe('raw.jsonl line 1 (duplicate-01, "the pair judge stages the duplicate and the drain retires the older note a"): the raw output lacks after, actions, night');
  });
});
