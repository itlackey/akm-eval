// Retrieval metrics against the dataset's evidence sessions, and the paired difference between the two arms.

const round = (x: number): number => Number(x.toFixed(4));

export interface Retrieval {
  returned: number;
  /** An evidence session is among the results. */
  hit: boolean;
  /** The share of the evidence sessions among the results. */
  recall: number;
  /** The share of the k places that hold an evidence session. Fewer than k results leave places empty. */
  precision: number;
  /** One over the rank of the first evidence session, or 0. */
  mrr: number;
  ndcg: number;
}

/** `retrieved` is the dataset session ids in rank order. Only the first k count. */
export function retrievalMetrics(evidence: string[], retrieved: string[], k: number): Retrieval {
  const relevant = new Set(evidence);
  const results = retrieved.slice(0, k);
  const found = results.filter((id) => relevant.has(id));
  let dcg = 0;
  let firstRank = 0;
  results.forEach((id, i) => {
    if (!relevant.has(id)) return;
    dcg += 1 / Math.log2(i + 2);
    if (firstRank === 0) firstRank = i + 1;
  });
  let ideal = 0;
  for (let i = 0; i < Math.min(relevant.size, k); i++) ideal += 1 / Math.log2(i + 2);
  return {
    returned: results.length,
    hit: found.length > 0,
    recall: relevant.size === 0 ? 0 : round(new Set(found).size / relevant.size),
    precision: round(found.length / k),
    mrr: firstRank === 0 ? 0 : round(1 / firstRank),
    ndcg: ideal === 0 ? 0 : round(dcg / ideal),
  };
}

export interface RetrievalSummary {
  k: number;
  n: number;
  zero_hit_rate: number | null;
  hit_rate: number | null;
  recall: number | null;
  precision: number | null;
  mrr: number | null;
  ndcg: number | null;
}

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : round(xs.reduce((a, b) => a + b, 0) / xs.length));

export function summarizeRetrieval(rows: Retrieval[], k: number): RetrievalSummary {
  return {
    k,
    n: rows.length,
    zero_hit_rate: mean(rows.map((r) => (r.returned === 0 ? 1 : 0))),
    hit_rate: mean(rows.map((r) => (r.hit ? 1 : 0))),
    recall: mean(rows.map((r) => r.recall)),
    precision: mean(rows.map((r) => r.precision)),
    mrr: mean(rows.map((r) => r.mrr)),
    ndcg: mean(rows.map((r) => r.ndcg)),
  };
}

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
