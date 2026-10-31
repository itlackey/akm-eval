// The paired statistics of memory-utility: an exact McNemar test and an exact paired interval. The outcome of a case is binary in each
// arm, so a pair is one of four kinds and only the two discordant kinds (one arm right, the other wrong) say anything about a difference.
import { pairedDifference } from "../../../benchmarks/longmemeval/src/metrics.ts";

export const TEST_METHOD = "exact McNemar test (two-sided exact binomial test on the discordant pairs)";
export const INTERVAL_METHOD = "95% melded exact interval compatible with the exact McNemar test (Fay and Lumbard 2021)";

/** log(n!) as a running sum: a case count is a few hundred at most. */
const logFactorials: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1]! + Math.log(i);
  return logFactorials[n]!;
}
/** P(X = k) for X ~ Binomial(n, p). */
function pmf(n: number, k: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
/** P(X <= k) for X ~ Binomial(n, p). */
function cdf(n: number, k: number, p: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += pmf(n, i, p);
  return Math.min(1, sum);
}
/** The x in [lo, hi] at which `f`, which rises with x, reaches `target`. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The two-sided exact p-value of McNemar's test, 2 * P(X <= min(b, c)) for X ~ Binomial(b + c, 1/2), at most 1. It is 1 with no discordant pair. */
export function mcnemarP(b: number, c: number): number {
  const n = b + c;
  return n === 0 ? 1 : Math.min(1, 2 * cdf(n, Math.min(b, c), 0.5));
}

/** Holm's step-down adjustment of p-values, in the order given: the i-th smallest is multiplied by (m - i + 1), made to never fall below the one before, and capped at 1. */
export function holm(ps: number[]): number[] {
  const adjusted: number[] = [];
  let running = 0;
  ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([p, i], k) => { running = Math.max(running, Math.min(1, (ps.length - k) * p)); adjusted[i] = Number(running.toPrecision(6)); });
  return adjusted;
}

/** A Beta(a, b) distribution with whole a, b >= 0, as Clopper-Pearson limits use: a = 0 is a point mass at 0, b = 0 one at 1. */
type Beta = [number, number];
/** P(B <= t). For whole a, b >= 1 it is P(Binomial(a + b - 1, t) >= a). */
function betaCdf([a, b]: Beta, t: number): number {
  if (t < 0) return 0;
  if (t >= 1 || a === 0) return 1;
  if (b === 0) return 0;
  return 1 - cdf(a + b - 1, a - 1, t);
}
function betaQuantile(beta: Beta, q: number): number {
  return beta[0] === 0 ? 0 : beta[1] === 0 ? 1 : solve(t => betaCdf(beta, t), q, 0, 1);
}
/** The q-quantile of T * (2B - 1) for independent T and B: the mean of B's distribution over a grid of T's quantiles. */
function meldedQuantile(t: Beta, b: Beta, q: number): number {
  if (b[0] === 0) return -betaQuantile(t, 1 - q); // B is 0: the value is -T
  if (b[1] === 0) return betaQuantile(t, q); // B is 1: the value is T
  const grid = Array.from({ length: 1000 }, (_, i) => betaQuantile(t, (i + 0.5) / 1000));
  return solve(y => grid.reduce((sum, s) => sum + betaCdf(b, (1 + y / s) / 2), 0) / grid.length, q, -1, 1);
}

const round = (x: number): number => Number(x.toFixed(4));

/**
 * The 95% interval of the paired difference (cases only `after` got right, minus cases only `before` got right, over all n pairs), by
 * Fay and Lumbard (2021, Statistics in Medicine 40:1147), the interval that goes with the exact McNemar test: it leaves out zero exactly
 * when that test's two-sided p is below 0.05. The difference is theta * (2 beta - 1), where theta is the chance that a pair is
 * discordant and beta the chance that `after` wins a discordant pair. Each limit melds the one-sided Clopper-Pearson confidence
 * distributions of theta and beta at 2.5%, so the uncertainty of the share of discordant pairs is counted too. With no discordant pair
 * it is a narrow interval around zero; null with fewer than two pairs.
 */
export function exactPairedInterval(onlyBefore: number, onlyAfter: number, n: number): [number, number] | null {
  if (n < 2) return null;
  const key = `${onlyBefore}/${onlyAfter}/${n}`; // a run summarizes at every checkpoint, and each interval takes up to a few tenths of a second
  if (!intervals.has(key)) intervals.set(key, meldedInterval(onlyBefore, onlyAfter, n));
  return [...intervals.get(key)!];
}
const intervals = new Map<string, [number, number]>();
function meldedInterval(onlyBefore: number, onlyAfter: number, n: number): [number, number] {
  const m = onlyBefore + onlyAfter, x = onlyAfter, tail = 0.025;
  const thetaLow: Beta = [m, n - m + 1], thetaHigh: Beta = [m + 1, n - m];
  const betaLow: Beta = [x, m - x + 1], betaHigh: Beta = [x + 1, m - x];
  // The one-sided exact sign tests choose which limit of theta each limit of the difference takes.
  const pLow = betaCdf(betaLow, 0.5), pHigh = 1 - betaCdf(betaHigh, 0.5);
  const low = meldedQuantile(pLow <= tail ? thetaLow : thetaHigh, betaLow, tail);
  const high = meldedQuantile(pHigh <= tail ? thetaLow : thetaHigh, betaHigh, 1 - tail);
  return [round(Math.max(-1, low)), round(Math.min(1, high))];
}

/** One case seen by both arms of a pair. `evaluated` is true when both arms produced a scorable answer. */
export interface PairCase { before: boolean; after: boolean; evaluated: boolean }

/**
 * A paired difference between two arms: the point estimate, the exact McNemar p-value and the exact interval, and the help/harm/tie
 * counts. `evaluatedOnly` leaves out the cases an arm did not answer; otherwise they stay as wrong answers (a failure-inclusive difference),
 * and the test is run on that same set, so the value, the p-value and the interval describe the same pairs.
 */
export function pairSummary(cases: PairCase[], evaluatedOnly: boolean) {
  const subset = evaluatedOnly ? cases.filter(c => c.evaluated) : cases;
  const complete = subset.filter(c => c.evaluated);
  const difference = pairedDifference(subset.map(c => ({ without: c.before, with: c.after })));
  const ci95 = difference.value === null || !complete.length ? null : exactPairedInterval(difference.only_without_akm, difference.only_with_akm, subset.length);
  return { ...difference, ci95, p_value: difference.n === 0 ? null : Number(mcnemarP(difference.only_without_akm, difference.only_with_akm).toPrecision(6)),
    test: TEST_METHOD, interval_method: INTERVAL_METHOD,
    complete_pairs: complete.length, incomplete_pairs: subset.length - complete.length,
    helps: complete.filter(c => !c.before && c.after).length,
    harms: complete.filter(c => c.before && !c.after).length,
    ties: complete.filter(c => c.before === c.after).length };
}
