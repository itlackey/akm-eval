// The benchmark's metrics: NDCG, Recall, Completeness and MAP at k = 5, 10 and 15, as SkillRet's own code
// (trec_eval over pytrec_eval, in skillret/eval.py) computes them. Relevance is binary. Completeness@k is the share of
// queries whose relevant skills are all among the first k. A query with no results scores 0, and every query counts.
// A query's scores are not rounded, only the means are, as in the benchmark: lib/ir.ts rounds each query to four
// places, which moves a mean by a unit in its last place on a small set. score.test.ts checks all four metrics against
// pytrec_eval on hand-made rankings.

import { mean } from "../../../lib/ir.ts";

export const KS = [5, 10, 15] as const;
export const METRICS = ["NDCG", "Recall", "Completeness", "MAP"] as const;

/** Metric name to value, in the benchmark's own names: `NDCG@5`, `NDCG@10`, ... `MAP@15`. */
export type Scores = Record<string, number>;

/** One query's scores. `relevant` are its relevant skill ids, `ranked` the ids akm returned, best first. */
export function scoreQuery(relevant: string[], ranked: string[]): Scores {
  const want = new Set(relevant);
  const results = [...new Set(ranked)];
  const at = Object.fromEntries(
    KS.map((k) => {
      let found = 0;
      let precisionSum = 0;
      let dcg = 0;
      results.slice(0, k).forEach((id, i) => {
        if (!want.has(id)) return;
        found++;
        precisionSum += found / (i + 1);
        dcg += 1 / Math.log2(i + 2);
      });
      let ideal = 0;
      for (let i = 0; i < Math.min(want.size, k); i++) ideal += 1 / Math.log2(i + 2);
      return [k, { NDCG: dcg / ideal, Recall: found / want.size, Completeness: found === want.size ? 1 : 0, MAP: precisionSum / want.size }];
    }),
  );
  return Object.fromEntries(METRICS.flatMap((m) => KS.map((k) => [`${m}@${k}`, at[k][m]])));
}

/** The mean of each metric over the queries, to four places. Empty for no queries. */
export function summarize(rows: Scores[]): Scores {
  if (rows.length === 0) return {};
  return Object.fromEntries(Object.keys(rows[0]).map((name) => [name, mean(rows.map((r) => r[name])) as number]));
}
