import { describe, expect, test } from "bun:test";
import { type Row, hasVerdict, makeRow, metrics, rawOf, routeFor, rowFromVerdict, summarize } from "./score.ts";

const newGood = { id: "n-good", mode: "new", label: "good" } as const;
const newBad = { id: "n-bad", mode: "new", label: "bad", kind: "dated-status" } as const;
const upGood = { id: "u-good", mode: "update", label: "good" } as const;
const upBad = { id: "u-bad", mode: "update", label: "bad", kind: "restated-update" } as const;

const verdict = (v: Record<string, unknown>) => ({ judge_outcome: "verdict", runner: "judge", schemaVersion: 1, ...v });
const PASS = verdict({ pass: true, score: 4.67, reason: "ok", criteria: { reusable: 5, nonRedundancy: 5, grounding: 4 } });
const REVIEW = verdict({ pass: false, reviewNeeded: true, score: 3, reason: "meh", criteria: { reusable: 3, nonRedundancy: 3, grounding: 3 } });
const REJECT = verdict({ pass: false, score: 1.5, reason: "status", criteria: { reusable: 1, nonRedundancy: 2, grounding: 4 } });

describe("the route distill takes", () => {
  test("a new lesson: pass, then reviewNeeded, then reject (routeOf)", () => {
    expect(routeFor("new", { pass: true })).toBe("pass");
    expect(routeFor("new", { pass: false, reviewNeeded: true })).toBe("review");
    expect(routeFor("new", { pass: false })).toBe("reject");
  });

  test("an update routes on pass alone: reviewNeeded is not read (proposeLessonUpdate)", () => {
    expect(routeFor("update", { pass: true })).toBe("pass");
    expect(routeFor("update", { pass: false, reviewNeeded: true })).toBe("reject");
    expect(routeFor("update", { pass: false })).toBe("reject");
    // a verdict that says reviewNeeded and pass at once passes, as in distill
    expect(routeFor("update", { pass: true, reviewNeeded: true })).toBe("pass");
  });

  test("the same verdict is a review for a new lesson and a rejection for an update", () => {
    expect(rowFromVerdict(newBad, REVIEW, 1).outcome).toBe("review");
    expect(rowFromVerdict(upBad, REVIEW, 1).outcome).toBe("reject");
  });
});

describe("a judge that gave no verdict", () => {
  const none = (judge_outcome: string) => ({ judge_outcome, runner: "judge", schemaVersion: 1, reason: "boom" });

  test("is routed as distill's noVerdict is: review for a new lesson, reject for an update, with a null score", () => {
    for (const kind of ["error", "unparseable"] as const) {
      const n = rowFromVerdict(newGood, none(kind), 2);
      expect(n).toMatchObject({ outcome: "review", score: null, no_verdict: kind, reason: "boom" });
      const u = rowFromVerdict(upGood, none(kind), 2);
      expect(u).toMatchObject({ outcome: "reject", score: null, no_verdict: kind });
      expect(hasVerdict(n)).toBe(false);
    }
  });

  test("an error and an unparseable reply stay apart in the metrics, and a verdict that is not a verdict is akm's failure", () => {
    const rows = [rowFromVerdict(newGood, none("error"), 1), rowFromVerdict(newGood, none("unparseable"), 1), rowFromVerdict(newGood, PASS, 1), rowFromVerdict(newGood, { judge_outcome: "verdict" }, 1)];
    expect(rows[3]).toMatchObject({ outcome: "error", error: "the verdict has no pass and score" });
    const m = metrics(rows);
    expect(m.no_verdict.error).toEqual({ n: 3, count: 1, rate: 0.3333 });
    expect(m.no_verdict.unparseable).toEqual({ n: 3, count: 1, rate: 0.3333 });
    expect(m.akm_failed).toEqual({ n: 4, count: 1, rate: 0.25 });
    expect(m.good.new).toEqual({ n: 3, passed: 1, rate: 0.3333 });
  });

  test("no envelope at all is an errored row, left out of the counts", () => {
    const row = makeRow(newGood, { error: "akm exited 70", seconds: 3 });
    expect(row).toMatchObject({ outcome: "error", error: "akm exited 70", runner: null });
    expect(makeRow(newGood, { error: "slow", seconds: 9, timedOut: true })).toMatchObject({ timed_out: true });
    expect(summarize([row]).n_errored).toBe(1);
    expect(summarize([row]).metrics.good.new.n).toBe(0);
  });
});

describe("rawOf", () => {
  test("reads a stored row back to the raw output it was scored from", () => {
    const row = makeRow(newBad, { verdict: PASS, seconds: 2 });
    expect(rawOf(row)).toEqual({ raw: { verdict: PASS, seconds: 2 } });
    expect(makeRow(newBad, (rawOf(row) as { raw: any }).raw)).toEqual(row);
  });

  test("refuses a verdict that does not say which schema it is, and an error row without its message", () => {
    const { schemaVersion: _drop, ...old } = PASS;
    expect(rawOf({ verdict: old, seconds: 1 })).toEqual({ missing: ["verdict.schemaVersion"] });
    expect(rawOf({ outcome: "error", seconds: 1 })).toEqual({ missing: ["error"] });
    expect(rawOf({ outcome: "pass", seconds: 1 })).toEqual({ missing: ["verdict"] });
    expect(rawOf({ outcome: "error", error: "x", seconds: 1, timed_out: true })).toEqual({ raw: { error: "x", seconds: 1, timedOut: true } });
  });
});

describe("the metrics", () => {
  const rows: Row[] = [
    rowFromVerdict(newGood, PASS, 10),
    rowFromVerdict({ ...newGood, id: "n-good-2" }, REVIEW, 20),
    rowFromVerdict(newBad, PASS, 30),
    rowFromVerdict({ ...newBad, id: "n-bad-2", kind: "duplicate-asset" }, REJECT, 40),
    rowFromVerdict(upGood, PASS, 5),
    rowFromVerdict(upBad, REVIEW, 15),
    rowFromVerdict({ ...upBad, id: "u-bad-2", kind: "off-rule-update" }, PASS, 25),
  ];
  const m = metrics(rows);

  test("good and bad passed, by mode, and the bad ones by kind", () => {
    expect(m.good.new).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.bad.new).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.good.update).toEqual({ n: 1, passed: 1, rate: 1 });
    expect(m.bad.update).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.bad_by_kind).toEqual({
      "new/dated-status": { n: 1, passed: 1, rate: 1 },
      "new/duplicate-asset": { n: 1, passed: 0, rate: 0 },
      "update/off-rule-update": { n: 1, passed: 1, rate: 1 },
      "update/restated-update": { n: 1, passed: 0, rate: 0 },
    });
  });

  test("routes, rejected good cases and the review share (new lessons only)", () => {
    expect(m.routes["new/good"]).toEqual({ pass: 1, review: 1, reject: 0 });
    expect(m.routes["update/restated-update"]).toEqual({ pass: 0, review: 0, reject: 1 });
    expect(m.good_rejected.new).toEqual({ n: 2, count: 0, rate: 0 });
    expect(m.review_share).toEqual({ n: 4, count: 1, rate: 0.25 });
  });

  test("precision, the criterion means of the good and the bad, and seconds", () => {
    expect(m.precision.new).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(m.criteria.new.good.reusable).toEqual({ n: 2, mean: 4 });
    expect(m.criteria.new.bad.reusable).toEqual({ n: 2, mean: 3 });
    expect(m.criteria.new.bad.grounding.mean).toBe(4);
    expect(m.seconds).toEqual({ mean: 20.714, median: 20, max: 40 });
  });

  test("the trivial baselines on the same cases", () => {
    expect(m.baselines.pass_all.new).toEqual({ good: { n: 2, passed: 2, rate: 1 }, bad: { n: 2, passed: 2, rate: 1 }, precision: 0.5 });
    expect(m.baselines.reject_all.update).toEqual({ good: { n: 1, passed: 0, rate: 0 }, bad: { n: 2, passed: 0, rate: 0 }, precision: null });
  });

  test("an empty run has null rates, not NaN", () => {
    const empty = metrics([]);
    expect(empty.good.new.rate).toBeNull();
    expect(empty.seconds).toEqual({ mean: null, median: null, max: null });
    expect(empty.criteria.update.good.reusable).toEqual({ n: 0, mean: null });
  });
});
