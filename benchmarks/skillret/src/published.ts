// What SkillRet reports for other retrievers on the same data: its test split at v1.1, 6,006 skills and 4,392 queries.
// These are the authors' numbers, from Table 3 of https://arxiv.org/abs/2605.05726 (v3) and the results table of
// https://github.com/ThakiCloud/SKILLRET, and are not run here. The paper reports no MAP. A run prints them
// next to akm's only when it is the whole public split.
//
// Each row: NDCG@5, NDCG@10, NDCG@15, Recall@5, Recall@10, Recall@15, Completeness@5, Completeness@10, Completeness@15.

export const PUBLISHED: [name: string, scores: number[]][] = [
  ["BM25", [49.31, 51.69, 52.75, 53.03, 59.41, 62.92, 38.21, 44.56, 47.93]],
  ["bge-small-en-v1.5 (33M)", [52.57, 54.51, 55.45, 54.73, 60.01, 63.07, 38.96, 43.97, 47.11]],
  ["bge-large-en-v1.5 (335M)", [57.04, 59.0, 59.8, 59.19, 64.37, 66.95, 42.96, 48.34, 50.8]],
  ["Qwen3-Embedding-8B", [61.35, 63.64, 64.73, 64.24, 70.29, 73.76, 47.43, 54.14, 58.15]],
  ["SKILLRET-Embedding-8B (fine-tuned by them)", [84.58, 86.44, 86.95, 88.55, 93.25, 94.84, 80.35, 88.11, 90.8]],
];
