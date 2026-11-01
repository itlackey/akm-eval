import { describe, expect, test } from "bun:test";
import { exactPairedInterval, holm, mcnemarP, pairSummary } from "./stats.ts";

describe("Holm's adjustment", () => {
  test("matches the values R's p.adjust(method = \"holm\") gives", () => {
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]);
    expect(holm([0.02, 0.04])).toEqual([0.04, 0.04]);
    expect(holm([0.03, 0.2])).toEqual([0.06, 0.2]);
    expect(holm([0.2, 0.03])).toEqual([0.2, 0.06]); // in the order given
    expect(holm([0.01, 0.011, 0.5])).toEqual([0.03, 0.03, 0.5]);
  });
  test("is capped at one, never below the raw p-value, and one p-value is unchanged", () => {
    expect(holm([0.6, 0.8])).toEqual([1, 1]);
    expect(holm([0.3])).toEqual([0.3]);
    for (const ps of [[0.001, 0.2], [0.5, 0.5], [0, 1]]) holm(ps).forEach((p, i) => expect(p).toBeGreaterThanOrEqual(ps[i]!));
  });
});

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
  test("matches Fay and Lumbard's worked example", () => {
    // Their Table 1: 86 pairs, 16 won only by one arm and 8 only by the other. They report (-0.030, 0.214) for a difference of 8/86.
    expect(exactPairedInterval(8, 16, 86)).toEqual([-0.0302, 0.2145]);
  });
  test("with no discordant pair it is the closed form around zero: 1 - 0.025^(1/n) either side", () => {
    const half = Number((1 - 0.025 ** (1 / 40)).toFixed(4));
    expect(exactPairedInterval(0, 0, 40)).toEqual([-half, half]);
  });
  test("counts the uncertainty of the share of discordant pairs: a one-sided result is not capped at its own estimate", () => {
    // 18 of 40 pairs won by one arm and none by the other: the difference is 0.45, and it could be larger.
    const [lo, hi] = exactPairedInterval(0, 18, 40)!;
    expect(lo).toBeGreaterThan(0); expect(hi).toBeGreaterThan(0.45);
  });
  test("leaves out zero exactly when the exact McNemar test is significant at 0.05", () => {
    const n = 12;
    for (let b = 0; b <= n; b++) for (let c = 0; b + c <= n; c++) {
      const [lo, hi] = exactPairedInterval(b, c, n)!;
      expect(lo > 0 || hi < 0).toBe(mcnemarP(b, c) < 0.05);
    }
  });
  test("contains the point estimate, stays in [-1, 1], and is null with fewer than two pairs", () => {
    for (const [b, c, n] of [[0, 7, 20], [3, 1, 9], [0, 2, 2], [9, 0, 9], [5, 5, 10]] as const) {
      const [lo, hi] = exactPairedInterval(b, c, n)!;
      const value = (c - b) / n;
      expect(lo).toBeLessThanOrEqual(value); expect(hi).toBeGreaterThanOrEqual(value);
      expect(lo).toBeGreaterThanOrEqual(-1); expect(hi).toBeLessThanOrEqual(1);
    }
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
  test("no pairs and no complete pair have no interval; no discordant pair has one around zero", () => {
    expect(pairSummary([], false)).toMatchObject({ n: 0, value: null, ci95: null, p_value: null });
    expect(pairSummary(cases([[true, true, true], [false, false, true]]), false)).toMatchObject({ value: 0, ci95: [-0.8419, 0.8419], p_value: 1 });
    expect(pairSummary(cases([[false, true, false], [false, true, false]]), true)).toMatchObject({ n: 0, ci95: null });
  });
});
