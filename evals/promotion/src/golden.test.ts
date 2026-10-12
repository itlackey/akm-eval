import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts, nextVersion } from "../../../lib/manifest.ts";
import { MEASUREMENT } from "./measurement.ts";
import { BAD } from "./score.ts";

// The golden files are in ../golden/: nine cases, and 29 raw outputs for them. Each is what the drain gave for a proposal, as a run stores it: the
// outcome, the judge's reason where akm keeps one, and the message of a call that failed. They cover each outcome for a good proposal and for each kind
// of bad one, an accept and a reject with no reason (akm 0.9.26 keeps none for an accept or a defer), the errors that are timeouts in the words akm and
// the endpoints use for them and the errors that are not, a drain that lists nothing for a proposal, and a failure with no detail. cases.jsonl holds the
// ids, labels, categories and refs of nine cases of assets/cases.jsonl, which is all the scorer reads of a case, with the notes cut short. A change to
// the corpus does not move them. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN);
    expect(goldenProblems(MEASUREMENT, GOLDEN)).toEqual([]);
  });

  test("the raw outputs cover every outcome, every category, a timeout, an error that is not one, and an empty reason", () => {
    const expected = lines("expected.jsonl");
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["accept", "reject", "defer", "error"]));
    expect(new Set(expected.map((r) => r.category))).toEqual(new Set(["good", ...BAD]));
    expect(expected.filter((r) => r.outcome === "error").map((r) => r.timed_out === true)).toEqual([false, true, false, false, true, true, false, true]);
    expect(expected.some((r) => r.outcome === "accept" && r.reason === "")).toBe(true);
    expect(expected.some((r) => r.outcome === "reject" && r.reason === "")).toBe(true);
    expect(expected.length).toBe(lines("raw.jsonl").length);
    expect(expected.every((r, i) => r.id === lines("raw.jsonl")[i].case)).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would: an error is no verdict, and only a timeout is marked", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const errors = expected.filter((r) => r.outcome === "error");
    expect(errors.map((r) => r.error)).toEqual([
      "LLM request failed: <MODEL_BASE_URL>/chat/completions refused",
      "LLM request timed out after 600000ms",
      "the drain did not list the proposal",
      "failed",
      "The operation timed out.",
      "Timeout of 60000ms exceeded",
      "HTTP 429 Too Many Requests: rate limit reached",
      "LLM request failed: <MODEL_BASE_URL>/chat/completions timed out",
    ]);
    expect(errors.every((r) => r.reason === "")).toBe(true);
    // a row copies the label and category of its case, and the outcome and reason of the raw output
    const cases = lines("cases.jsonl");
    for (const [i, r] of expected.entries()) {
      const c = cases.find((x) => x.id === raw[i].case);
      expect({ id: r.id, label: r.label, category: r.category, ref: r.ref, outcome: r.outcome }).toEqual({ id: c.id, label: c.label, category: c.category, ref: c.ref, outcome: raw[i].raw.outcome });
    }
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const summary = MEASUREMENT.summarize(lines("expected.jsonl"));
    expect(summary).toMatchObject({ n_run: 29, n_errored: 8, timeouts: 4 });
    expect(summary.metrics.proposals).toEqual({ n: 21, good: 8, share_good: 0.381 });
    expect(summary.metrics.accepted).toEqual({ n: 9, good: 4 });
    expect(summary.metrics.by_category.ephemeral).toEqual({ n: 4, accepted: 2, rate: 0.5 });
  });

  test("a stored row scores to itself again: rawOf reads the raw output back and the scorer gives the row", () => {
    const cases = lines("cases.jsonl");
    for (const row of lines("expected.jsonl")) {
      const read = MEASUREMENT.rawOf(row);
      expect("raw" in read).toBe(true);
      expect(MEASUREMENT.score(cases.find((c) => c.id === row.id), (read as { raw: any }).raw)).toEqual(row);
    }
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "promotion-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), ...(raw.outcome === "defer" ? { label: c.label === "good" ? "bad" : "good" } : {}) }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir));
    expect(problems.length).toBe(4);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 4 \(good-01, "the judge defers because its reply could not be read"\) is not the expected one: label: expected "good", got "bad"/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir))).toEqual([]);
  });

  test("a scorer that stops reading a timeout from the text of the error fails the test", () => {
    const blind: Measurement = { ...MEASUREMENT, score: (c, raw) => MEASUREMENT.score(c, raw.outcome === "error" ? { ...raw, error: "" } : raw) };
    const problems = withCopy((dir) => goldenProblems(blind, dir));
    expect(problems.length).toBe(8);
    expect(problems[1]).toContain('(good-02, "the model call times out")');
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    const problems = withCopy((dir) => {
      writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: nextVersion(live) }));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems).toEqual([`scorer.json is for scorer version ${nextVersion(live)} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
  });

  test("a raw output the scorer cannot read, a case that is not there and a missing file are named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { outcome: "accept" } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2, 4), { ...raw[4], raw: { outcome: "error", reason: "" } }, ...raw.slice(5)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems.slice(0, 3)).toEqual([
      'raw.jsonl line 1 (good-01, "the judge accepts a good proposal and akm 0.9.26 keeps no reason"): the raw output lacks reason',
      'raw.jsonl line 2 (no-such-case, "the judge accepts a good proposal and akm keeps its reason"): the case is not in cases.jsonl',
      'raw.jsonl line 5 (good-01, "the model endpoint refuses the call"): the raw output lacks error',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir)))[0]).toContain("expected.jsonl is missing");
  });
});
