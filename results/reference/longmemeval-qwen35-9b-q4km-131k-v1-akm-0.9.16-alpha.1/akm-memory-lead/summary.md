# Result: longmemeval-qwen35-9b-q4km-131k-v1-akm-memory-lead

- Pack: longmemeval
- Variant: akm-memory-lead
- Model: qwen3.5-9b
- Memory backend: akm
- Status: passed
- Aggregate score: 0.396

## Notes

- LongMemEval executed 500 question(s) and scored them with the official evaluator command.
- Overall accuracy: 39.6%
- Evaluator model: gpt-4o
- Per-question answer checkpoint: /home/founder3/code/github/itlackey/akm-eval/runs/qwen-reference-akm-0.9.16-alpha.1-2026-09-10/akm-memory-lead/.checkpoints/longmemeval-ff8b9541744fc174d692a2d1a485efc4cb1cc331910ddbd3700298d5791f7583.jsonl (188/500 answer(s) resumed).
- Memory-backed retrieval mode using topK=5; each question resets the backend and adds only its own haystack sessions (one document per session) before searching. The full-haystack (`none`/disabled-backend) arm in this same comparison answers every question from its ENTIRE haystack -- a lower score here than that arm does not necessarily mean retrieval quality is worse; it can mean retrieval lost an answer a full-context baseline structurally cannot lose. See metadata.thisArmContextMode.
- Retrieval zero-hit rate: 0/500 queries returned no results (0.0%).
- Average results returned per query: 4.98 (topK=5). precisionAtK is divided by the number of results actually returned, not by topK, so a backend that returns fewer results per query (e.g. akm returning only genuine hits) reports a structurally higher precisionAtK than a backend that always returns topK results (e.g. raw-vector, with no relevance threshold) for the same underlying retrieval quality. Do not compare precisionAtK across backends with different result-count behavior without accounting for this.
- 30/500 questions are abstention ("_abs") instances, graded on whether the model correctly declines to answer rather than on factual recall. A retrieval arm handed little or no context can abstain more easily than a full-context baseline with more surface to hallucinate from, so part of any overallAccuracy difference between arms on this dataset reflects that confound rather than answer quality alone. See metadata.abstentionQuestionCount.
- akm indexing (akm >= 0.9.2): full body prose is indexed, not just synthesized description/tags/heading — the pre-0.9.2 body-prose ceiling was lifted by akm#819 (see docs/memory-backends.md for older runs measured under it). This backend still synthesizes description/tags/heading from the first sentence(s) of each session document and still applies a fixed deterministic stopword strip to each query, but akm search now runs a progressive strict-AND -> prefix-AND -> OR/prefix-OR fallback rather than a hard conjunctive-AND, so a full-AND miss no longer means zero hits. The seeded akm skeleton corpus is stripped before ingestion so no foreign content can appear in results. See src/memory/backends/akm.ts and docs/memory-backends.md.

## Retrieval metrics

- query count: 500
- precision@k: 0.3276
- recall@k: 0.875033
- mrr: 0.8318
- ndcg@k: 0.815939

## Answer metrics

- exact match: n/a
- token f1: n/a
- contains expected: n/a
- judged pass: 0.396

## Warnings

- none
