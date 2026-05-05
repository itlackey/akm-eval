import type { MemorySearchResult, RetrievalMetrics } from './types.ts';

export function scoreRetrieval(
  relevantIds: string[] = [],
  results: MemorySearchResult[] = [],
  topK = results.length || 1,
): RetrievalMetrics {
  const relevant = new Set(relevantIds);
  const limited = results.slice(0, Math.max(1, topK));
  const hits = limited.filter((result) => relevant.has(result.id));
  const precisionAtK = limited.length === 0 ? 0 : hits.length / limited.length;
  const recallAtK = relevant.size === 0 ? 0 : hits.length / relevant.size;

  let reciprocalRank = 0;
  limited.forEach((result, index) => {
    if (reciprocalRank === 0 && relevant.has(result.id)) {
      reciprocalRank = 1 / (index + 1);
    }
  });

  let dcg = 0;
  limited.forEach((result, index) => {
    if (relevant.has(result.id)) {
      dcg += 1 / Math.log2(index + 2);
    }
  });

  let ideal = 0;
  for (let index = 0; index < Math.min(relevant.size, limited.length); index += 1) {
    ideal += 1 / Math.log2(index + 2);
  }

  return {
    queryCount: 1,
    precisionAtK: Number(precisionAtK.toFixed(6)),
    recallAtK: Number(recallAtK.toFixed(6)),
    mrr: Number(reciprocalRank.toFixed(6)),
    ndcgAtK: Number((ideal === 0 ? 0 : dcg / ideal).toFixed(6)),
  };
}
