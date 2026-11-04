import { describe, expect, test } from "bun:test";
import { type Case, type Category, type Outcome, type Row, errored, hasVerdict, makeRow, metrics, rawOf, summarize } from "./score.ts";

const who = (category: Category): Pick<Case, "id" | "set" | "origin" | "label" | "category"> => ({ id: `${category}-1`, set: "s", origin: "real", label: category === "good" ? "good" : "bad", category });
const verdict = (decision: string, extra: Record<string, unknown> = {}) => ({ outcome: "verdict", decision, reason: `because ${decision}`, engine: "judge", schemaVersion: 1, ...extra });
const row = (category: Category, outcome: Outcome, seconds = 1): Row => ({ ...makeRow(who(category), { seconds }), outcome, ...(outcome === "error" ? { error: "x" } : {}) }) as Row;

describe("makeRow: the drain's route for a verdict on a promotion", () => {
  test.each(["accept", "reject", "defer"])("a %s is that outcome", (decision) => {
    const r = makeRow(who("good"), { verdict: verdict(decision), seconds: 2 });
    expect(r).toMatchObject({ outcome: decision, reason: `because ${decision}`, engine: "judge", seconds: 2, label: "good", category: "good" });
    expect(hasVerdict(r)).toBe(true);
  });

  test("a reply with no decision is unparseable: left pending, and counted", () => {
    const r = makeRow(who("stale"), { verdict: { outcome: "unparseable", reason: "no decision", schemaVersion: 1 }, seconds: 1 });
    expect(r.outcome).toBe("unparseable");
    expect(hasVerdict(r)).toBe(false);
    expect(errored(r)).toBe(false);
  });

  test("a failed judge call, akm failing and a decision outside accept, reject and defer are errors", () => {
    expect(makeRow(who("good"), { verdict: { outcome: "error", reason: "429", schemaVersion: 1 }, seconds: 1 })).toMatchObject({ outcome: "error", error: "429" });
    expect(makeRow(who("good"), { error: "akm failed", seconds: 1 })).toMatchObject({ outcome: "error", error: "akm failed" });
    expect(makeRow(who("good"), { error: "slow", seconds: 9, timedOut: true })).toMatchObject({ outcome: "error", timed_out: true });
    expect(makeRow(who("good"), { verdict: verdict("maybe"), seconds: 1 }).outcome).toBe("error");
    expect(errored(makeRow(who("good"), { seconds: 1 }))).toBe(true);
  });
});

describe("rawOf", () => {
  test("a stored row gives back the raw output it was scored from, and a row from before the schemaVersion is refused", () => {
    const stored = makeRow(who("duplicate"), { verdict: verdict("reject"), seconds: 3 });
    expect(rawOf(stored)).toEqual({ raw: { verdict: stored.verdict, seconds: 3 } });
    expect(makeRow(who("duplicate"), (rawOf(stored) as any).raw)).toEqual(stored);
    expect(rawOf({ ...stored, verdict: { outcome: "verdict", decision: "reject" } })).toEqual({ missing: ["verdict.schemaVersion"] });
    const failed = makeRow(who("good"), { error: "boom", seconds: 4, timedOut: true });
    expect(makeRow(who("good"), (rawOf(failed) as any).raw)).toEqual(failed);
  });
});

describe("metrics", () => {
  const rows = [
    row("good", "accept"), row("good", "accept"), row("good", "reject"), row("good", "defer"),
    row("ephemeral", "accept"), row("ephemeral", "reject"), row("ephemeral", "defer"),
    row("duplicate", "accept"), row("duplicate", "reject"),
    row("stale", "reject"), row("stale", "unparseable"), row("stale", "error"),
  ];
  const m = metrics(rows);

  test("what the drain accepts, by label and by kind of bad; an errored case is left out", () => {
    expect(m.good_accepted).toEqual({ n: 4, count: 2, rate: 0.5 });
    expect(m.bad_accepted).toEqual({ n: 7, count: 2, rate: 0.2857 });
    expect(m.by_category.ephemeral).toEqual({ n: 3, count: 1, rate: 0.3333 });
    expect(m.by_category.duplicate).toEqual({ n: 2, count: 1, rate: 0.5 });
    expect(m.by_category.stale).toEqual({ n: 2, count: 0, rate: 0 });
    expect(m.precision).toEqual({ value: 0.5, accepted_good: 2, accepted: 4 });
    expect(m.good_rejected).toEqual({ n: 4, count: 1, rate: 0.25 });
  });

  test("a deferred promotion is not accepted: it is counted in the defer rate of its label and never as a bad accepted", () => {
    expect(m.defer_rate.good).toEqual({ n: 4, count: 1, rate: 0.25 });
    expect(m.defer_rate.bad).toEqual({ n: 7, count: 1, rate: 0.1429 });
    expect(m.left_pending.bad).toEqual({ n: 7, count: 2, rate: 0.2857 });
    const onlyDeferred = metrics([row("ephemeral", "defer"), row("ephemeral", "defer")]);
    expect(onlyDeferred.bad_accepted).toEqual({ n: 2, count: 0, rate: 0 });
  });

  test("bad accepted is split by where the case came from, so the hand-written cases do not hide the others", () => {
    const from = (r: Row, origin: Row["origin"]): Row => ({ ...r, origin });
    const split = metrics([from(row("ephemeral", "accept"), "corpus"), from(row("ephemeral", "reject"), "corpus"), from(row("stale", "reject"), "hand-written"), from(row("duplicate", "error"), "hand-written"), row("good", "accept")]);
    expect(split.bad_by_origin).toEqual({ real: { n: 0, count: 0, rate: null }, corpus: { n: 2, count: 1, rate: 0.5 }, "hand-written": { n: 1, count: 0, rate: 0 } });
  });

  test("the confusion matrix counts every row, errors included, and the rates count the failures", () => {
    expect(m.confusion.stale).toEqual({ accept: 0, reject: 1, defer: 0, unparseable: 1, error: 1 });
    expect(m.error_rate).toEqual({ n: 12, count: 1, rate: 0.0833 });
    expect(m.unparseable_rate).toEqual({ n: 12, count: 1, rate: 0.0833 });
  });

  test("the trivial baselines on the same cases", () => {
    expect(m.baselines.accept_all).toEqual({ good_accepted: { n: 4, count: 4, rate: 1 }, bad_accepted: { n: 7, count: 7, rate: 1 }, precision: 0.3636 });
    expect(m.baselines.reject_all.good_accepted.count).toBe(0);
    expect(m.baselines.reject_all.precision).toBeNull();
    expect(m.baselines.defer_all.bad_accepted.count).toBe(0);
  });

  test("seconds are over the cases that were not errored", () => {
    const timed = metrics([row("good", "accept", 2), row("good", "reject", 4), row("stale", "error", 100)]);
    expect(timed.seconds).toEqual({ mean: 3, median: 3, max: 4 });
    expect(metrics([]).seconds).toEqual({ mean: null, median: null, max: null });
  });

  test("summarize counts the run, the scored and the errored", () => {
    const s = summarize([...rows, { ...row("good", "error"), timed_out: true }]);
    expect(s).toMatchObject({ n_run: 13, n_scored: 11, n_errored: 2, timeouts: 1 });
  });
});
