import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts, nextVersion } from "../../../lib/manifest.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: six of the public cases, with 23 raw outputs for them. Each is a realistic verdict of akm's judge, or a
// reason there is none: a revision passed, sent to a person, rejected, a reply akm could not read and routed to review, a judge that refuses
// to judge, a reply with no verdict in it, nothing printed, a crash and a timeout. cases.jsonl is a copy of those cases of assets/cases.jsonl,
// so a change to the corpus does not move them. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN);
    expect(goldenProblems(MEASUREMENT, GOLDEN)).toEqual([]);
  });

  test("the raw outputs cover both labels and both severities, every outcome, a reply with no verdict, an empty output and a timeout", () => {
    const expected = lines("expected.jsonl");
    expect(lines("raw.jsonl").length).toBe(expected.length);
    expect(new Set(expected.map((r) => `${r.label}${r.severity ? `:${r.severity}` : ""}`))).toEqual(new Set(["good", "bad:harmful", "bad:churn"]));
    expect(new Set(expected.map((r) => r.outcome))).toEqual(new Set(["pass", "review", "reject", "error"]));
    expect(expected.some((r) => r.outcome === "review" && r.score === null)).toBe(true); // a reply akm could not read
    expect(expected.some((r) => r.outcome === "review" && r.score !== null)).toBe(true); // a judged review
    expect(expected.some((r) => r.timed_out === true)).toBe(true);
    expect(expected.some((r) => r.outcome === "error" && r.error === "akm exited 0: ")).toBe(true);
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const outcome = (note: string) => expected.filter((_, i) => raw[i].note === note).map((r) => r.outcome);
    expect(outcome("the judge passes a good revision")).toEqual(["pass", "pass"]);
    expect(outcome("the judge sends a good revision to a person")).toEqual(["review"]);
    expect(outcome("the judge rejects a good revision")).toEqual(["reject", "reject"]);
    expect(outcome("the judge passes a harmful revision")).toEqual(["pass"]);
    expect(outcome("a verdict that passes and asks for a review passes")).toEqual(["pass"]); // pass wins over reviewNeeded
    // a score of -1 routed to review is a review with no score, whatever the text says; one routed nowhere is an error
    const unread = expected.filter((_, i) => /could not read|timed out inside akm/.test(raw[i].note));
    expect(unread.map((r) => [r.outcome, r.score])).toEqual([["review", null], ["review", null]]);
    expect(unread.map((r) => r.reason)).toEqual(["judge parse failed — routed to review", "judge timeout/error — routed to review"]);
    const refused = expected.find((_, i) => /refuses to judge/.test(raw[i].note));
    expect(refused).toMatchObject({ outcome: "error", error: "no engine configured — cannot judge, failing closed" });
    expect(expected.find((_, i) => /no reason/.test(raw[i].note))).toMatchObject({ outcome: "error", error: "no verdict" });
    // a reply with no pass and score in it is an error, whatever else it holds
    for (const note of ["akm prints a JSON object with no pass and score", "akm prints null", "akm prints a list"]) expect(expected.find((_, i) => raw[i].note === note)).toMatchObject({ outcome: "error", error: "the verdict has no pass and score" });
    // the severity of a bad case is in its row, and a good case has none
    expect(expected.filter((r) => r.label === "good").every((r) => !("severity" in r))).toBe(true);
    expect(expected.filter((r) => r.label === "bad").every((r) => r.severity === "harmful" || r.severity === "churn")).toBe(true);
    // a timeout is an error with timed_out; a crash is one without
    const timedOut = expected.filter((r) => r.timed_out === true);
    expect(timedOut).toHaveLength(1);
    expect(timedOut[0]).toMatchObject({ outcome: "error", error: "akm exited 137: akm timed out after 900s" });
    expect(expected.find((_, i) => raw[i].note === "akm crashes")).not.toHaveProperty("timed_out");
  });

  test("the summary takes its counts and metrics from the rows", () => {
    const cases = lines("cases.jsonl");
    const rows = lines("raw.jsonl").map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    const summary = MEASUREMENT.summarize(rows);
    expect(summary).toMatchObject({ n_run: 23, n_scored: 23 - summary.n_errored, timeouts: 1 });
    expect(summary.n_errored).toBe(rows.filter((r) => r.outcome === "error").length);
    expect(summary.metrics.good.n + summary.metrics.bad.n).toBe(23 - summary.n_errored);
    expect(summary.metrics.bad_harmful.n + summary.metrics.bad_churn.n).toBe(summary.metrics.bad.n);
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "judge-gate-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), outcome: MEASUREMENT.score(c, raw).outcome === "pass" ? "reject" : MEASUREMENT.score(c, raw).outcome }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(7901df92-[0-9a-f-]+, "the judge passes a good revision"\) is not the expected one: outcome: expected "pass", got "reject"/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir))).toEqual([]);
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
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { outcome: "pass", seconds: 1 } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems.slice(0, 2)).toEqual([
      expect.stringMatching(/^raw\.jsonl line 1 \(7901df92-[0-9a-f-]+, "the judge passes a good revision"\): the raw output lacks verdict$/),
      'raw.jsonl line 2 (no-such-case, "the judge sends a good revision to a person"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir)))[0]).toContain("expected.jsonl is missing");
  });
});
