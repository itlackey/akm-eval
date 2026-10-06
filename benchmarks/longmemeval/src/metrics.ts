// The rates the benchmark reports, and the paired difference between the two arms. The retrieval metrics, scored
// against the dataset's evidence sessions, are in lib/ir.ts.

const round = (x: number): number => Number(x.toFixed(4));

export interface Rate {
  n: number;
  correct: number;
  rate: number | null;
}

export const rate = (correct: number, n: number): Rate => ({ n, correct, rate: n === 0 ? null : round(correct / n) });

export interface PairedDifference {
  /** Questions both arms scored. */
  n: number;
  /** Accuracy with akm minus accuracy without it, over those questions. */
  value: number | null;
  /** A 95% interval for it, from the questions where the arms disagree. None when they never disagree. */
  ci95: [number, number] | null;
  both_correct: number;
  only_with_akm: number;
  only_without_akm: number;
  neither: number;
}

export function pairedDifference(pairs: { without: boolean; with: boolean }[]): PairedDifference {
  const n = pairs.length;
  const both = pairs.filter((p) => p.without && p.with).length;
  const onlyWith = pairs.filter((p) => !p.without && p.with).length;
  const onlyWithout = pairs.filter((p) => p.without && !p.with).length;
  const neither = n - both - onlyWith - onlyWithout;
  if (n === 0) return { n, value: null, ci95: null, both_correct: 0, only_with_akm: 0, only_without_akm: 0, neither: 0 };
  const value = (onlyWith - onlyWithout) / n;
  // The variance of a difference of paired proportions.
  const variance = (onlyWith + onlyWithout - (onlyWith - onlyWithout) ** 2 / n) / n ** 2;
  const half = 1.96 * Math.sqrt(Math.max(variance, 0));
  return {
    n,
    value: round(value),
    ci95: n < 2 || onlyWith + onlyWithout === 0 ? null : [round(Math.max(-1, value - half)), round(Math.min(1, value + half))],
    both_correct: both,
    only_with_akm: onlyWith,
    only_without_akm: onlyWithout,
    neither,
  };
}
