// Retrieval metrics the evals share: a ranked list of ids against graded relevance, cut at k.
// retrieval scores akm's results with them. longmemeval scores the sessions its memory returns.

const round = (x: number): number => Number(x.toFixed(4));

export interface Retrieval {
  returned: number;
  /** A relevant id is among the results. */
  hit: boolean;
  /** The share of the relevant ids among the results. */
  recall: number;
  /** The share of the k places that hold a relevant id. Fewer than k results leave places empty. */
  precision: number;
  /** One over the rank of the first relevant id, or 0. */
  mrr: number;
  /** Graded: a result of grade g gains 2^g - 1, discounted by log2 of its rank + 1. */
  ndcg: number;
}

/**
 * `relevance` is either the relevant ids, or an id to grade map. An id counts as relevant at `minGrade` or more
 * (grade 1 for a list). The ids outside the map have grade 0. `retrieved` is ids in rank order. An id that comes again is dropped (the first
 * place stands), then only the first k count, so `returned` and every metric count distinct ids.
 */
export function retrievalMetrics(relevance: string[] | Record<string, number>, retrieved: string[], k: number, minGrade = 1): Retrieval {
  const grades = new Map<string, number>(Array.isArray(relevance) ? relevance.map((id) => [id, 1]) : Object.entries(relevance));
  const relevant = new Set([...grades].filter(([, g]) => g >= minGrade).map(([id]) => id));
  const results = [...new Set(retrieved)].slice(0, k);
  const found = results.filter((id) => relevant.has(id));
  const dcg = (gs: number[]) => gs.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = dcg([...grades.values()].sort((a, b) => b - a).slice(0, k));
  const firstRank = results.findIndex((id) => relevant.has(id)) + 1;
  return {
    returned: results.length,
    hit: found.length > 0,
    recall: relevant.size === 0 ? 0 : round(found.length / relevant.size),
    precision: round(found.length / k),
    mrr: firstRank === 0 ? 0 : round(1 / firstRank),
    ndcg: ideal === 0 ? 0 : round(dcg(results.map((id) => grades.get(id) ?? 0)) / ideal),
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

export const mean = (xs: number[]): number | null => (xs.length === 0 ? null : round(xs.reduce((a, b) => a + b, 0) / xs.length));

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
