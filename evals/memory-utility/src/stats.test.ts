import { describe, expect, test } from "bun:test";
import { clopperPearson, exactPairedInterval, mcnemarP, pairSummary } from "./stats.ts";

describe("exact McNemar test", () => {
  test("matches binomial values worked out by hand", () => {
    expect(mcnemarP(1, 5)).toBeCloseTo(0.21875, 10); // 2 * (1 + 6) / 64
    expect(mcnemarP(0, 10)).toBeCloseTo(2 / 1024, 12);
    expect(mcnemarP(2, 8)).toBeCloseTo(112 / 1024, 12); // 2 * (1 + 10 + 45) / 1024
    expect(mcnemarP(3, 12)).toBeCloseTo(1152 / 32768, 12); // 2 * (1 + 15 + 105 + 455) / 32768
  });
  test("is symmetric, one for a tie and for no discordant pair, and never above one", () => {
    expect(mcnemarP(5, 1)).toBe(mcnemarP(1, 5));
    expect(mcnemarP(5, 5)).toBe(1);
    expect(mcnemarP(0, 0)).toBe(1);
    expect(mcnemarP(4, 5)).toBe(1);
  });
  test("uses the exact tail for a large count", () => {
    // 60 against 40: the exact two-sided p is 0.0569 (the normal approximation without correction gives 0.0455).
    expect(mcnemarP(40, 60)).toBeCloseTo(0.0568, 3);
  });
});

describe("exact paired interval", () => {
  test("Clopper-Pearson matches the published values", () => {
    const [lo, hi] = clopperPearson(5, 10);
    expect(lo).toBeCloseTo(0.1871, 4); expect(hi).toBeCloseTo(0.8129, 4);
    expect(clopperPearson(0, 10)).toEqual([0, expect.closeTo(0.3085, 4)] as any);
    const [l1, h1] = clopperPearson(1, 6);
    expect(l1).toBeCloseTo(0.0042, 4); expect(h1).toBeCloseTo(0.6412, 4);
    expect(clopperPearson(10, 10)[1]).toBe(1);
  });
  test("scales the discordant interval by the share of discordant pairs", () => {
    // 5 and 5 discordant of 10 pairs: [0.1871, 0.8129] on theta gives [-0.6258, 0.6258] on the difference.
    expect(exactPairedInterval(5, 5, 10)).toEqual([-0.6258, 0.6258]);
    // The same discordant pairs among 50 pairs are a fifth as wide.
    expect(exactPairedInterval(5, 5, 50)).toEqual([-0.1252, 0.1252]);
  });
  test("contains the point estimate, stays in [-1, 1], and is null with no discordant pair or fewer than two pairs", () => {
    for (const [b, c, n] of [[0, 7, 20], [3, 1, 9], [0, 2, 2], [9, 0, 9]] as const) {
      const [lo, hi] = exactPairedInterval(b, c, n)!;
      const value = (c - b) / n;
      expect(lo).toBeLessThanOrEqual(value); expect(hi).toBeGreaterThanOrEqual(value);
      expect(lo).toBeGreaterThanOrEqual(-1); expect(hi).toBeLessThanOrEqual(1);
    }
    expect(exactPairedInterval(0, 0, 24)).toBeNull();
    expect(exactPairedInterval(1, 0, 1)).toBeNull();
  });
});

describe("pairSummary", () => {
  const cases = (spec: [boolean, boolean, boolean][]) => spec.map(([before, after, evaluated]) => ({ before, after, evaluated }));
  test("the value, the p-value, the interval and the counts describe the same pairs", () => {
    const s = pairSummary(cases([[false, true, true], [false, true, true], [true, true, true], [false, false, true], [true, false, true]]), false);
    expect(s).toMatchObject({ n: 5, value: 0.2, only_with_akm: 2, only_without_akm: 1, both_correct: 1, neither: 1, helps: 2, harms: 1, ties: 2, p_value: 1 });
    expect(s.ci95![0]).toBeLessThan(0.2); expect(s.ci95![1]).toBeGreaterThan(0.2);
  });
  test("a failure-inclusive difference keeps an unanswered arm as wrong, a complete-pair one leaves the case out", () => {
    const spec: [boolean, boolean, boolean][] = [[true, true, true], [true, false, false], [false, true, true]];
    expect(pairSummary(cases(spec), false)).toMatchObject({ n: 3, only_without_akm: 1, only_with_akm: 1, helps: 1, harms: 0, ties: 1, incomplete_pairs: 1 });
    expect(pairSummary(cases(spec), true)).toMatchObject({ n: 2, only_without_akm: 0, only_with_akm: 1, complete_pairs: 2, incomplete_pairs: 0 });
  });
  test("no pairs, no complete pair and no discordant pair have no interval", () => {
    expect(pairSummary([], false)).toMatchObject({ n: 0, value: null, ci95: null, p_value: null });
    expect(pairSummary(cases([[true, true, true], [false, false, true]]), false)).toMatchObject({ value: 0, ci95: null, p_value: 1 });
    expect(pairSummary(cases([[false, true, false], [false, true, false]]), true)).toMatchObject({ n: 0, ci95: null });
  });
});
