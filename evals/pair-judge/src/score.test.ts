import { describe, expect, test } from "bun:test";
import { type Case, type Row, type Verdict, distinctive, expectedRelation, makeRow, matches, metrics, rawOf, retiredSide, summarize, tallyClaims, words } from "./score.ts";

const note = (ref: string, content: string, type = "memory") => ({ ref, type, created: "2026-11-01T00:00:00.000Z", updated: "2026-11-01T00:00:00.000Z", content });

/** A pair with a few claims: a holds "the retry limit is 5", b holds "the dead queue is jobs-dead", and they share the rest. */
function pair(over: Partial<Case> = {}): Case {
  return {
    id: "p1",
    kind: "overlap",
    set: "pairs",
    source: "pair-pass",
    a: note("memories/a", "---\ndescription: retries\n---\n\nThe worker retries. The retry limit is 5.\n"),
    b: note("memories/b", "---\ndescription: retries\n---\n\nThe worker retries. Dead jobs go to the queue jobs-dead.\n"),
    safe: [],
    only_a: ["The retry limit is 5."],
    only_b: ["Dead jobs go to the queue jobs-dead."],
    labelReason: "r",
    ...over,
  };
}

const verdict = (over: Partial<Verdict> = {}): Verdict => ({ onlyInA: ["retry limit 5"], onlyInB: ["jobs-dead queue"], relation: "overlap", redundant: null, confidence: 0.8, reason: "x", engine: "judge", schemaVersion: 1, ...over });

describe("the relation the labels expect", () => {
  test("is read from how many sides are safe", () => {
    expect(expectedRelation({ safe: ["a", "b"] })).toBe("duplicate");
    expect(expectedRelation({ safe: ["b"] })).toBe("subsumed");
    expect(expectedRelation({ safe: [] })).toBe("overlap");
  });
});

describe("what consolidate retires on a verdict (retiredSide)", () => {
  const c = pair();
  const v = (o: Partial<Verdict>) => ({ relation: "overlap", redundant: null, onlyInA: [], onlyInB: [], ...o });
  test("a duplicate retires the older note, a, whatever the redundant pointer says", () => {
    expect(retiredSide(c, v({ relation: "duplicate", redundant: "A" }))).toBe("a");
    expect(retiredSide(c, v({ relation: "duplicate", redundant: null }))).toBe("a");
  });
  test("a subsumed pair retires the side the verdict calls redundant", () => {
    expect(retiredSide(c, v({ relation: "subsumed", redundant: "A", onlyInB: ["x"] }))).toBe("a");
    expect(retiredSide(c, v({ relation: "subsumed", redundant: "B", onlyInA: ["x"] }))).toBe("b");
  });
  test("overlap, contradicts and unrelated retire nothing", () => {
    for (const relation of ["overlap", "contradicts", "unrelated"]) expect(retiredSide(c, v({ relation, redundant: "A" }))).toBeNull();
  });
  test("a supersedes label retires the older note, as decideRetirement does", () => {
    expect(retiredSide(c, v({ relation: "supersedes" }))).toBe("a");
  });
  test("nothing is retired when the judge listed a claim only that note holds", () => {
    expect(retiredSide(c, v({ relation: "subsumed", redundant: "A", onlyInA: ["x"] }))).toBeNull();
    expect(retiredSide(c, v({ relation: "duplicate", onlyInA: ["x"] }))).toBeNull();
  });
  test("a knowledge note is never replaced by a memory: the retirement is turned round, or dropped when the memory holds a claim of its own", () => {
    const k = pair({ a: note("knowledge/a", "x", "knowledge"), b: note("memories/b", "y") });
    expect(retiredSide(k, v({ relation: "subsumed", redundant: "A", onlyInB: [] }))).toBe("b");
    expect(retiredSide(k, v({ relation: "subsumed", redundant: "A", onlyInB: ["a claim of the memory"] }))).toBeNull();
    expect(retiredSide(k, v({ relation: "subsumed", redundant: "B", onlyInA: ["x"] }))).toBe("b");
    const same = pair({ a: note("knowledge/a", "x", "knowledge"), b: note("knowledge/b", "y", "knowledge") });
    expect(retiredSide(same, v({ relation: "subsumed", redundant: "A" }))).toBe("a");
  });
});

describe("the claim matcher", () => {
  test("words drops markdown and the punctuation around a word, and keeps the word whole", () => {
    expect(words("Set `SKIP=eslint`, then see LICENSE.txt (01:00).")).toEqual(["set", "skip=eslint", "then", "see", "license.txt", "01:00"]);
    expect(words("lumen_queue_dropped: \"x\"")).toEqual(["lumen_queue_dropped", "x"]);
  });
  test("the distinctive words of a claim are those the other note lacks", () => {
    expect(distinctive("The retry limit is 5.", "The worker retries. Dead jobs go to jobs-dead.")).toEqual(["retry", "limit", "5"]);
  });
  test("an item matches a claim when it holds at least a third of the distinctive words", () => {
    const against = "Dead jobs are kept for 30 days.";
    const claim = "Dead jobs are kept for 7 days.";
    expect(distinctive(claim, against)).toEqual(["7"]);
    expect(matches("kept 7 days", claim, against)).toBe(true);
    expect(matches("kept 30 days", claim, against)).toBe(false);
    const long = "Variable fonts are not allowed, because the print pipeline cannot flatten them.";
    expect(matches("variable fonts not allowed", long, "Licence files are kept next to each font.")).toBe(true);
    expect(matches("fonts are embedded", long, "Licence files are kept next to each font.")).toBe(false);
  });
  test("a short item matches when every word of it the other note lacks is in the claim", () => {
    const against = "# Pellam CI\n\nCI uses Node 20.11. Builds run on Linux.";
    const claim = "CI uses Node 22.3, since the March upgrade.";
    expect(distinctive(claim, against)).toEqual(["22.3", "since", "march", "upgrade"]);
    expect(matches("Node 22.3", claim, against)).toBe(true);
    expect(matches("CI uses Node 22.3", claim, against)).toBe(true);
    expect(matches("Node 22.3 on macOS", claim, against)).toBe(false);
    expect(matches("CI uses Node", claim, against)).toBe(false);
  });
  test("a claim with no word the other note lacks matches nothing", () => {
    expect(matches("the lowest", "Priority 0 is the lowest.", "Priority 0 is the lowest.")).toBe(false);
  });
  test("each item is found, on the wrong list, or unlabelled; a labelled claim is found once", () => {
    const c = pair();
    expect(tallyClaims(c, { onlyInA: ["retry limit 5", "retry limit is 5"], onlyInB: ["jobs-dead queue", "an invented claim about disks"] })).toEqual({ labelled: 2, unmatchable: 0, found: 2, listed: 4, wrong_side: 0, unlabelled: 1 });
    expect(tallyClaims(c, { onlyInA: ["jobs-dead queue"], onlyInB: [] })).toEqual({ labelled: 2, unmatchable: 0, found: 0, listed: 1, wrong_side: 1, unlabelled: 0 });
  });
  test("claims that differ in word order only are counted apart and left out of labelled", () => {
    const order = pair({ a: note("memories/a", "Priority 0 is the lowest."), b: note("memories/b", "Priority 0 is the lowest."), only_a: ["Priority 0 is the lowest."], only_b: [] });
    expect(tallyClaims(order, { onlyInA: [], onlyInB: [] })).toMatchObject({ labelled: 0, unmatchable: 1, found: 0 });
  });
});

describe("a row", () => {
  test("an overlap verdict on an overlap pair is kept, with the relation right and the claims found", () => {
    const row = makeRow(pair(), { verdict: verdict(), seconds: 2 });
    expect(row).toMatchObject({ outcome: "keep", retired: null, retired_safe: null, relation: "overlap", right: true, confidence: 0.8, engine: "judge", seconds: 2, expected: "overlap" });
    expect(row.claims).toMatchObject({ found: 2, labelled: 2, unlabelled: 0 });
  });
  test("a retirement of a note that is not safe is unsafe", () => {
    const row = makeRow(pair(), { verdict: verdict({ onlyInA: [], relation: "subsumed", redundant: "A" }), seconds: 1 });
    expect(row).toMatchObject({ outcome: "retire", retired: "a", retired_safe: false, right: false });
  });
  test("a retirement of a safe note is safe, and a subsumed pair needs the redundant side to be the safe one", () => {
    const c = pair({ kind: "subsumed", safe: ["b"], only_b: [] });
    expect(makeRow(c, { verdict: verdict({ onlyInB: [], relation: "subsumed", redundant: "B" }), seconds: 1 })).toMatchObject({ outcome: "retire", retired: "b", retired_safe: true, right: true });
    // The judge misses b's claim and so names a as the redundant note, which holds a claim of its own.
    expect(makeRow(c, { verdict: verdict({ onlyInA: [], onlyInB: ["x"], relation: "subsumed", redundant: "A" }), seconds: 1 })).toMatchObject({ outcome: "retire", retired: "a", retired_safe: false, right: false });
  });
  test("a duplicate judged subsumed retires a safe note but has the wrong relation", () => {
    const c = pair({ kind: "duplicate", safe: ["a", "b"], only_a: [], only_b: [] });
    expect(makeRow(c, { verdict: verdict({ onlyInA: [], onlyInB: ["x"], relation: "subsumed", redundant: "A" }), seconds: 1 })).toMatchObject({ outcome: "retire", retired_safe: true, right: false });
  });
  test("a judge that gave no verdict is a failed judgment: nothing is retired, and it is not an error", () => {
    const row = makeRow(pair(), { noVerdict: { outcome: "unparseable", reason: "the reply held no verdict" }, seconds: 3 });
    expect(row).toMatchObject({ outcome: "failed", retired: null, relation: null, right: null, claims: null, reason: "the reply held no verdict", no_verdict: { outcome: "unparseable" } });
  });
  test("akm failing, or printing a verdict without the fields, is an error that is left out of the counts", () => {
    expect(makeRow(pair(), { error: "exit 1", seconds: 1, timedOut: true })).toMatchObject({ outcome: "error", error: "exit 1", timed_out: true });
    expect(makeRow(pair(), { verdict: { pass: true }, seconds: 1 })).toMatchObject({ outcome: "error" });
    expect(makeRow(pair(), { seconds: 1 })).toMatchObject({ outcome: "error", error: "no verdict" });
  });
  test("a stored row is scored again from its raw output, and one without the judge's schemaVersion is not", () => {
    const c = pair();
    for (const raw of [{ verdict: verdict(), seconds: 2 }, { noVerdict: { outcome: "error", reason: "timeout" }, seconds: 2 }, { error: "boom", seconds: 2, timedOut: false }]) {
      const row = makeRow(c, raw);
      const back = rawOf(JSON.parse(JSON.stringify(row)));
      expect(back).toHaveProperty("raw");
      expect(makeRow(c, (back as { raw: any }).raw)).toEqual(row);
    }
    const stored = JSON.parse(JSON.stringify(makeRow(c, { verdict: { ...verdict(), schemaVersion: undefined }, seconds: 2 })));
    expect(rawOf(stored)).toEqual({ missing: ["verdict.schemaVersion"] });
    expect(rawOf({ outcome: "failed", seconds: 1 })).toEqual({ missing: ["no_verdict"] });
  });
});

describe("the metrics", () => {
  const dup = pair({ id: "d", kind: "duplicate", safe: ["a", "b"], only_a: [], only_b: [] });
  const sub = pair({ id: "s", kind: "subsumed", safe: ["a"], only_a: [], only_b: ["Dead jobs go to the queue jobs-dead."] });
  const ovl = pair({ id: "o" });
  const row = (c: Case, v: Partial<Verdict>) => makeRow(c, { verdict: verdict(v), seconds: 1 });
  const rows: Row[] = [
    row(dup, { onlyInA: [], onlyInB: [], relation: "duplicate", redundant: "A", confidence: 0.9 }), // safe retirement, right
    row(sub, { onlyInA: [], onlyInB: ["jobs-dead queue"], relation: "subsumed", redundant: "A", confidence: 0.7 }), // safe, right
    row(ovl, { onlyInA: [], relation: "subsumed", redundant: "A", confidence: 0.6 }), // unsafe retirement
    makeRow(sub, { noVerdict: { outcome: "error", reason: "t" }, seconds: 5 }), // failed
    makeRow(ovl, { error: "x", seconds: 9 }), // errored: left out
  ];
  const m = metrics(rows);
  test("unsafe is counted over the pairs where a retirement could be unsafe, errored cases left out", () => {
    expect(m.unsafe).toEqual({ n: 3, count: 1, rate: 0.3333 });
  });
  test("found is counted over the pairs with a safe note, and a failed judgment finds nothing", () => {
    expect(m.found).toEqual({ n: 3, count: 2, rate: 0.6667 });
    expect(m.precision).toEqual({ value: 0.6667, safe: 2, retired: 3 });
    expect(m.failed).toEqual({ n: 4, count: 1, rate: 0.25 });
  });
  test("the relation, confusion matrix, kinds and confidence are over the cases with a verdict", () => {
    expect(m.relation).toEqual({ n: 3, count: 2, rate: 0.6667 });
    expect(m.confusion).toEqual({ duplicate: { duplicate: 1 }, subsumed: { subsumed: 1 }, overlap: { subsumed: 1 } });
    expect(m.by_kind.overlap).toEqual({ n: 1, failed: 0, retired_safe: 0, retired_unsafe: 1, kept: 0, right: 0 });
    expect(m.by_kind.subsumed).toEqual({ n: 2, failed: 1, retired_safe: 1, retired_unsafe: 0, kept: 0, right: 1 });
    expect(m.confidence).toEqual({ right: { n: 2, mean: 0.8 }, wrong: { n: 1, mean: 0.6 } });
    expect(m.seconds).toEqual({ n: 4, mean: 2 });
  });
  test("the baselines read the labels and no verdict", () => {
    expect(m.baselines.never_retire).toEqual({ unsafe: { n: 3, count: 0, rate: 0 }, found: { n: 3, count: 0, rate: 0 } });
    // Retiring a every time: unsafe only on the overlap (the subsumed pair's safe side is a; the duplicate cannot be unsafe), and finds the safe a of the duplicate and the subsumed pair, twice with the failed.
    expect(m.baselines.always_retire_older.unsafe).toEqual({ n: 3, count: 1, rate: 0.3333 });
    expect(m.baselines.always_retire_older.found).toEqual({ n: 3, count: 3, rate: 1 });
  });
  test("the most common relation is the labels' most common, ties by name", () => {
    expect(metrics([row(ovl, {}), row(ovl, {}), row(dup, { onlyInA: [], onlyInB: [], relation: "duplicate", redundant: "A" })]).baselines.most_common_relation).toEqual({ relation: "overlap", accuracy: { n: 3, count: 2, rate: 0.6667 } });
    expect(m.baselines.most_common_relation.relation).toBe("duplicate");
  });
  test("summarize counts the rows run, scored, errored and timed out", () => {
    expect(summarize(rows)).toMatchObject({ n_run: 5, n_scored: 4, n_errored: 1, timeouts: 0 });
  });
  test("nothing run gives no rates, not zeros", () => {
    expect(metrics([]).unsafe).toEqual({ n: 0, count: 0, rate: null });
    expect(metrics([]).confidence.right.mean).toBeNull();
  });
});
