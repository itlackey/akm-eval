# Result: longmemeval-qwen35-9b-q4km-131k-v1-raw-vector

- Pack: longmemeval
- Variant: raw-vector
- Model: qwen3.5-9b
- Memory backend: raw-vector
- Status: passed
- Aggregate score: 0.286

## Notes

- LongMemEval executed 500 question(s) and scored them with the official evaluator command.
- Overall accuracy: 28.6%
- Evaluator model: gpt-4o
- Per-question answer checkpoint: /home/founder3/code/github/itlackey/akm-eval/runs/reference/longmemeval-qwen35-9b-q4km-131k-v1/raw-vector/.checkpoints/longmemeval-37dbf9f807fdab60c783ca8d7da3b923fb3ad2d6374acf2e762981950f955e25.jsonl (0/500 answer(s) resumed).
- Memory-backed retrieval mode using topK=5; each question resets the backend and adds only its own haystack sessions (one document per session) before searching. The full-haystack (`none`/disabled-backend) arm in this same comparison answers every question from its ENTIRE haystack -- a lower score here than that arm does not necessarily mean retrieval quality is worse; it can mean retrieval lost an answer a full-context baseline structurally cannot lose. See metadata.thisArmContextMode.
- Retrieval zero-hit rate: 0/500 queries returned no results (0.0%).
- Average results returned per query: 5.00 (topK=5). precisionAtK is divided by the number of results actually returned, not by topK, so a backend that returns fewer results per query (e.g. akm returning only genuine hits) reports a structurally higher precisionAtK than a backend that always returns topK results (e.g. raw-vector, with no relevance threshold) for the same underlying retrieval quality. Do not compare precisionAtK across backends with different result-count behavior without accounting for this.
- 30/500 questions are abstention ("_abs") instances, graded on whether the model correctly declines to answer rather than on factual recall. A retrieval arm handed little or no context can abstain more easily than a full-context baseline with more surface to hallucinate from, so part of any overallAccuracy difference between arms on this dataset reflects that confound rather than answer quality alone. See metadata.abstentionQuestionCount.

## Retrieval metrics

- query count: 500
- precision@k: 0.1336
- recall@k: 0.400933
- mrr: 0.349633
- ndcg@k: 0.323383

## Answer metrics

- exact match: n/a
- token f1: n/a
- contains expected: n/a
- judged pass: 0.286

## Warnings

- none
