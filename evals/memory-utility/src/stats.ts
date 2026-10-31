// The paired statistics of memory-utility: an exact McNemar test and an exact paired interval. The outcome of a case is binary in each
// arm, so a pair is one of four kinds and only the two discordant kinds (one arm right, the other wrong) say anything about a difference.
import { pairedDifference } from "../../../benchmarks/longmemeval/src/metrics.ts";

export const TEST_METHOD = "exact McNemar test (two-sided exact binomial test on the discordant pairs)";
export const INTERVAL_METHOD = "exact 95% interval: Clopper-Pearson on the discordant pairs, scaled by their share of the pairs (conditional on that share)";

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
/** The p in [0, 1] at which `f`, which falls as p rises, equals `target`. */
function crossing(f: (p: number) => number, target: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The two-sided exact p-value of McNemar's test, 2 * P(X <= min(b, c)) for X ~ Binomial(b + c, 1/2), at most 1. It is 1 with no discordant pair. */
export function mcnemarP(b: number, c: number): number {
  const n = b + c;
  return n === 0 ? 1 : Math.min(1, 2 * cdf(n, Math.min(b, c), 0.5));
}

/** The Clopper-Pearson interval for x successes in n trials: the proportions that leave x out of neither tail of alpha / 2. */
export function clopperPearson(x: number, n: number, alpha = 0.05): [number, number] {
  return [x === 0 ? 0 : crossing(p => cdf(n, x - 1, p), 1 - alpha / 2), x === n ? 1 : crossing(p => cdf(n, x, p), alpha / 2)];
}

const round = (x: number): number => Number(x.toFixed(4));

/**
 * The interval of the paired difference (cases only `after` got right, minus cases only `before` got right, over all pairs). Conditional on the
 * number of discordant pairs d out of n, the cases `after` won are Binomial(d, theta), so the Clopper-Pearson interval of theta gives
 * (d / n) * (2 * theta - 1). Null with no discordant pair, where the data say nothing about the size of a difference.
 */
export function exactPairedInterval(onlyBefore: number, onlyAfter: number, n: number): [number, number] | null {
  const d = onlyBefore + onlyAfter;
  if (n < 2 || d === 0) return null;
  const [lo, hi] = clopperPearson(onlyAfter, d);
  return [round(Math.max(-1, (d / n) * (2 * lo - 1))), round(Math.min(1, (d / n) * (2 * hi - 1)))];
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
