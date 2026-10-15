# retrieval · eval 0.2 · scoring 0.2

A: cleanup-build-baseline-20261014 (/repo/reports/0.9.31/retrieval/cleanup-build-baseline-20261014-books)
B: cleanup-build-candidate-20261014 (/repo/reports/0.9.31/retrieval/cleanup-build-candidate-20261014-books)

Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.


| Metric / setting | A | B | Delta (B − A) | Note |
|---|---:|---:|---:|---|
| Run | cleanup-build-baseline-20261014 | cleanup-build-candidate-20261014 | — |  |
| Test | retrieval | retrieval | — |  |
| Collection | books | books | — |  |
| Collected (UTC) | 2026-10-14T22:45:35.210Z | 2026-10-14T22:46:44.314Z | — |  |
| Quality % | 95.52 | 95.52 | 0 |  |
| Quality metric | Keyword ranking · nDCG@10 | Keyword ranking · nDCG@10 | — |  |
| Quality cases | 12 | 12 | 0 |  |
| Cases recorded | 12 | 12 | 0 |  |
| Cases scored | 12 | 12 | 0 |  |
| Errors | 0 | 0 | 0 |  |
| Timeouts | 0 | 0 | 0 |  |
| Run wall time (s) | 29.661 | 27.664 | -1.997 |  |
| Run wall time basis | Runner elapsed | Runner elapsed | — |  |
| Keyword query mean (s) | 0.215833 | 0.2125 | -0.003333 |  |
| Keyword query p50 (s) | 0.21 | 0.21 | 0 |  |
| Keyword query p95 (s) | 0.24 | 0.23 | -0.01 |  |
| Keyword query timed | 12 | 12 | 0 |  |
| Semantic query mean (s) | 0.714167 | 0.656667 | -0.0575 |  |
| Semantic query p50 (s) | 0.71 | 0.66 | -0.05 |  |
| Semantic query p95 (s) | 0.7345 | 0.6645 | -0.07 |  |
| Semantic query timed | 12 | 12 | 0 |  |
| Keyword index (s) | 0.4 | 0.4 | 0 |  |
| Semantic index (s) | 4.8 | 4.3 | -0.5 |  |
| AKM version | 0.9.31 | 0.9.31 | — |  |
| Eval version | 0.2 | 0.2 | — |  |
| Scoring version | 0.2 | 0.2 | — |  |
| Search methods | keyword; semantic | keyword; semantic | — |  |
| Embedding model | Xenova/bge-small-en-v1.5 | Xenova/bge-small-en-v1.5 | — |  |
| Case limit | 12 | 12 | 0 |  |
| Retrieval depth | 10 | 10 | 0 |  |
| Semantic index state | cold | cold | — |  |
| Collector commit | 763b9d4f56a524ecb533cd1def46a79b3bf4cf94 | 763b9d4f56a524ecb533cd1def46a79b3bf4cf94 | — |  |
| AKM build | 85ad76b | ab45696 | — |  |
| Harness SHA | 897f342ecc05145ebe054cf4ea064f6d1279b4572b2cb2aad4ce27ca98a8c986 | 897f342ecc05145ebe054cf4ea064f6d1279b4572b2cb2aad4ce27ca98a8c986 | — |  |
| Inputs SHA | 621103e7306706313720d1b6cefdd5b2d650756742f1b56a75aac0158bbd51a1 | 621103e7306706313720d1b6cefdd5b2d650756742f1b56a75aac0158bbd51a1 | — |  |
| Config SHA | c566a4169735f3c958e1c3d6bab06f9c5e3601d80e3c9ff6efff4895bec89e88 | c566a4169735f3c958e1c3d6bab06f9c5e3601d80e3c9ff6efff4895bec89e88 | — |  |
| Keyword banned result above first relevant % | 0 | 0 | 0 |  |
| Keyword banned result above relevant % | 16.67 | 16.67 | 0 |  |
| Keyword hit rate@5 % | 100 | 100 | 0 |  |
| Keyword judged nDCG@10 | 0.9777 | 0.9777 | 0 |  |
| Keyword MRR | 1 | 1 | 0 |  |
| Keyword precision@5 % | 35 | 35 | 0 |  |
| Keyword ranking · nDCG@10 | 0.9552 | 0.9552 | 0 |  |
| Keyword recall@10 % | 100 | 100 | 0 |  |
| Keyword results with judgments % | 26.96 | 26.96 | 0 |  |
| Semantic banned result above first relevant % | 0 | 0 | 0 |  |
| Semantic banned result above relevant % | 16.67 | 16.67 | 0 |  |
| Semantic hit rate@5 % | 100 | 100 | 0 |  |
| Semantic judged nDCG@10 | 0.9915 | 0.9915 | 0 |  |
| Semantic MRR | 1 | 1 | 0 |  |
| Semantic precision@5 % | 35 | 35 | 0 |  |
| Semantic ranking · nDCG@10 | 0.9602 | 0.9602 | 0 |  |
| Semantic recall@10 % | 100 | 100 | 0 |  |
| Semantic results with judgments % | 23.33 | 23.33 | 0 |  |
| metrics.search.n | 12 | 12 | 0 |  |
| metrics.search.ndcg_10 | 0.9552 | 0.9552 | 0 |  |
| metrics.search.ndcg_10_condensed | 0.9777 | 0.9777 | 0 |  |
| metrics.search.p_5 | 0.35 | 0.35 | 0 |  |
| metrics.search.success_5 | 1 | 1 | 0 |  |
| metrics.search.mrr | 1 | 1 | 0 |  |
| metrics.search.recall_10 | 1 | 1 | 0 |  |
| metrics.search.judged_10 | 0.2696 | 0.2696 | 0 |  |
| metrics.search.banned_above | 0.1667 | 0.1667 | 0 |  |
| metrics.search.banned_above_first | 0 | 0 | 0 |  |
| metrics.curate.n | 12 | 12 | 0 |  |
| metrics.curate.ndcg_10 | 0.9552 | 0.9552 | 0 |  |
| metrics.curate.ndcg_10_condensed | 0.9777 | 0.9777 | 0 |  |
| metrics.curate.p_5 | 0.35 | 0.35 | 0 |  |
| metrics.curate.success_5 | 1 | 1 | 0 |  |
| metrics.curate.mrr | 1 | 1 | 0 |  |
| metrics.curate.recall_10 | 1 | 1 | 0 |  |
| metrics.curate.judged_10 | 0.2696 | 0.2696 | 0 |  |
| metrics.curate.banned_above | 0.1667 | 0.1667 | 0 |  |
| metrics.curate.banned_above_first | 0 | 0 | 0 |  |
| metrics.semantic_search.n | 12 | 12 | 0 |  |
| metrics.semantic_search.ndcg_10 | 0.9602 | 0.9602 | 0 |  |
| metrics.semantic_search.ndcg_10_condensed | 0.9915 | 0.9915 | 0 |  |
| metrics.semantic_search.p_5 | 0.35 | 0.35 | 0 |  |
| metrics.semantic_search.success_5 | 1 | 1 | 0 |  |
| metrics.semantic_search.mrr | 1 | 1 | 0 |  |
| metrics.semantic_search.recall_10 | 1 | 1 | 0 |  |
| metrics.semantic_search.judged_10 | 0.2333 | 0.2333 | 0 |  |
| metrics.semantic_search.banned_above | 0.1667 | 0.1667 | 0 |  |
| metrics.semantic_search.banned_above_first | 0 | 0 | 0 |  |
| metrics.semantic_curate.n | 12 | 12 | 0 |  |
| metrics.semantic_curate.ndcg_10 | 0.9602 | 0.9602 | 0 |  |
| metrics.semantic_curate.ndcg_10_condensed | 0.9915 | 0.9915 | 0 |  |
| metrics.semantic_curate.p_5 | 0.35 | 0.35 | 0 |  |
| metrics.semantic_curate.success_5 | 1 | 1 | 0 |  |
| metrics.semantic_curate.mrr | 1 | 1 | 0 |  |
| metrics.semantic_curate.recall_10 | 1 | 1 | 0 |  |
| metrics.semantic_curate.judged_10 | 0.2333 | 0.2333 | 0 |  |
| metrics.semantic_curate.banned_above | 0.1667 | 0.1667 | 0 |  |
| metrics.semantic_curate.banned_above_first | 0 | 0 | 0 |  |

Changed settings:

| Setting | A | B |
|---|---|---|
| akm | {"version":"0.9.31","bin":"bun /opt/akm-cli/node_modules/akm-cli/src/cli.ts","build":"85ad76b","build_fingerprint":null} | {"version":"0.9.31","bin":"bun /opt/akm-cli/node_modules/akm-cli/src/cli.ts","build":"ab45696","build_fingerprint":null} |
