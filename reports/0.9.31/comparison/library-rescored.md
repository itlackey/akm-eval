# retrieval · eval 0.2 · scoring 0.3

A: cleanup-build-baseline-20261014-rescored (/repo/reports/0.9.31/retrieval/cleanup-build-baseline-20261014-library-rescored)
B: cleanup-build-candidate-20261014-rescored (/repo/reports/0.9.31/retrieval/cleanup-build-candidate-20261014-library-rescored)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.


| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Run | cleanup-build-baseline-20261014-rescored | cleanup-build-candidate-20261014-rescored | — |  |
| Test | retrieval | retrieval | — |  |
| Collection | library | library | — |  |
| Collected (UTC) | 2026-10-14T22:45:05.544Z | 2026-10-14T22:46:16.645Z | — |  |
| Quality % | 67.33 | 67.33 | 0 |  |
| Quality metric | Keyword ranking · nDCG@10 | Keyword ranking · nDCG@10 | — |  |
| Quality cases | 8 | 8 | 0 |  |
| Cases recorded | 12 | 12 | 0 |  |
| Cases scored | 12 | 12 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Run wall time (s) | 43.01 | 40.88 | -2.13 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Keyword query mean (s) | 0.24 | 0.208333 | -0.031667 |  |
| Keyword query p50 (s) | 0.22 | 0.21 | -0.01 |  |
| Keyword query p95 (s) | 0.3225 | 0.21 | -0.1125 |  |
| Keyword query timed | 12 | 12 | 0 |  |
| Semantic query mean (s) | 0.695833 | 0.665833 | -0.03 |  |
| Semantic query p50 (s) | 0.675 | 0.66 | -0.015 |  |
| Semantic query p95 (s) | 0.814 | 0.688 | -0.126 |  |
| Semantic query timed | 12 | 12 | 0 |  |
| Keyword index (s) | 0.6 | 0.6 | 0 |  |
| Semantic index (s) | 17.2 | 16.9 | -0.3 |  |
| AKM version | 0.9.31 | 0.9.31 | — |  |
| Eval version | 0.2 | 0.2 | — |  |
| Scoring version | 0.3 | 0.3 | — |  |
| Search methods | keyword; semantic | keyword; semantic | — |  |
| Embedding model | Xenova/bge-small-en-v1.5 | Xenova/bge-small-en-v1.5 | — |  |
| Case limit | 12 | 12 | 0 |  |
| Retrieval depth | 10 | 10 | 0 |  |
| Semantic index state | cold | cold | — |  |
| Collector commit | 763b9d4f56a524ecb533cd1def46a79b3bf4cf94 | 763b9d4f56a524ecb533cd1def46a79b3bf4cf94 | — |  |
| AKM build | 85ad76b | ab45696 | — |  |
| Harness SHA | 897f342ecc05145ebe054cf4ea064f6d1279b4572b2cb2aad4ce27ca98a8c986 | 897f342ecc05145ebe054cf4ea064f6d1279b4572b2cb2aad4ce27ca98a8c986 | — |  |
| Inputs SHA | 286a47db65cd339f7c4eafe6689cc3740a1e115d64c59633a9da844ac011c060 | 286a47db65cd339f7c4eafe6689cc3740a1e115d64c59633a9da844ac011c060 | — |  |
| Config SHA | c566a4169735f3c958e1c3d6bab06f9c5e3601d80e3c9ff6efff4895bec89e88 | c566a4169735f3c958e1c3d6bab06f9c5e3601d80e3c9ff6efff4895bec89e88 | — |  |
| Keyword hit rate@5 % | 100 | 100 | 0 |  |
| Keyword judged nDCG@10 | 0.6733 | 0.6733 | 0 |  |
| Keyword MRR | 0.9167 | 0.9167 | 0 |  |
| Keyword precision@5 % | 45 | 45 | 0 |  |
| Keyword ranking · nDCG@10 | 0.6733 | 0.6733 | 0 |  |
| Keyword recall@10 % | 61.74 | 61.74 | 0 |  |
| Keyword results with judgments % | 100 | 100 | 0 |  |
| Semantic hit rate@5 % | 100 | 100 | 0 |  |
| Semantic judged nDCG@10 | 0.8663 | 0.8663 | 0 |  |
| Semantic MRR | 1 | 1 | 0 |  |
| Semantic precision@5 % | 52.5 | 52.5 | 0 |  |
| Semantic ranking · nDCG@10 | 0.8663 | 0.8663 | 0 |  |
| Semantic recall@10 % | 86.39 | 86.39 | 0 |  |
| Semantic results with judgments % | 100 | 100 | 0 |  |
| metrics.search.n | 8 | 8 | 0 |  |
| metrics.search.ndcg_10 | 0.6733 | 0.6733 | 0 |  |
| metrics.search.ndcg_10_condensed | 0.6733 | 0.6733 | 0 |  |
| metrics.search.p_5 | 0.45 | 0.45 | 0 |  |
| metrics.search.success_5 | 1 | 1 | 0 |  |
| metrics.search.mrr | 0.9167 | 0.9167 | 0 |  |
| metrics.search.recall_10 | 0.6174 | 0.6174 | 0 |  |
| metrics.search.judged_10 | 1 | 1 | 0 |  |
| metrics.curate.n | 8 | 8 | 0 |  |
| metrics.curate.ndcg_10 | 0.6733 | 0.6733 | 0 |  |
| metrics.curate.ndcg_10_condensed | 0.6733 | 0.6733 | 0 |  |
| metrics.curate.p_5 | 0.45 | 0.45 | 0 |  |
| metrics.curate.success_5 | 1 | 1 | 0 |  |
| metrics.curate.mrr | 0.9167 | 0.9167 | 0 |  |
| metrics.curate.recall_10 | 0.6174 | 0.6174 | 0 |  |
| metrics.curate.judged_10 | 1 | 1 | 0 |  |
| metrics.semantic_search.n | 8 | 8 | 0 |  |
| metrics.semantic_search.ndcg_10 | 0.8663 | 0.8663 | 0 |  |
| metrics.semantic_search.ndcg_10_condensed | 0.8663 | 0.8663 | 0 |  |
| metrics.semantic_search.p_5 | 0.525 | 0.525 | 0 |  |
| metrics.semantic_search.success_5 | 1 | 1 | 0 |  |
| metrics.semantic_search.mrr | 1 | 1 | 0 |  |
| metrics.semantic_search.recall_10 | 0.8639 | 0.8639 | 0 |  |
| metrics.semantic_search.judged_10 | 1 | 1 | 0 |  |
| metrics.semantic_curate.n | 8 | 8 | 0 |  |
| metrics.semantic_curate.ndcg_10 | 0.8663 | 0.8663 | 0 |  |
| metrics.semantic_curate.ndcg_10_condensed | 0.8663 | 0.8663 | 0 |  |
| metrics.semantic_curate.p_5 | 0.525 | 0.525 | 0 |  |
| metrics.semantic_curate.success_5 | 1 | 1 | 0 |  |
| metrics.semantic_curate.mrr | 1 | 1 | 0 |  |
| metrics.semantic_curate.recall_10 | 0.8639 | 0.8639 | 0 |  |
| metrics.semantic_curate.judged_10 | 1 | 1 | 0 |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| akm | {"version":"0.9.31","bin":"bun /opt/akm-cli/node_modules/akm-cli/src/cli.ts","build":"85ad76b","build_fingerprint":null} | {"version":"0.9.31","bin":"bun /opt/akm-cli/node_modules/akm-cli/src/cli.ts","build":"ab45696","build_fingerprint":null} |
