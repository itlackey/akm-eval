# Result: longmemeval-qwen35-9b-q4km-131k-v1-baseline

- Pack: longmemeval
- Variant: baseline
- Model: qwen3.5-9b
- Memory backend: none
- Status: passed
- Aggregate score: 0.392

## Notes

- LongMemEval executed 500 question(s) and scored them with the official evaluator command.
- Overall accuracy: 39.2%
- Evaluator model: gpt-4o
- Per-question answer checkpoint: /home/founder3/code/github/itlackey/akm-eval/runs/reference/longmemeval-qwen35-9b-q4km-131k-v1/baseline/.checkpoints/longmemeval-ac45af52c7b12278ab7db82ad7b77f2ebb2ec3186367faa228749286955306ee.jsonl (180/500 answer(s) resumed).
- Full-haystack baseline: every question is answered from its entire haystack conversation, flattened into the prompt -- not a "no memory" null arm in the retrieval-quality sense, since it differs from the retrieval arms in prompt construction and context length, not only in `memory.backend`.
- 30/500 questions are abstention ("_abs") instances, graded on whether the model correctly declines to answer rather than on factual recall. A retrieval arm handed little or no context can abstain more easily than a full-context baseline with more surface to hallucinate from, so part of any overallAccuracy difference between arms on this dataset reflects that confound rather than answer quality alone. See metadata.abstentionQuestionCount.

## Retrieval metrics

- query count: 0
- precision@k: 0
- recall@k: 0
- mrr: 0
- ndcg@k: 0

## Answer metrics

- exact match: n/a
- token f1: n/a
- contains expected: n/a
- judged pass: 0.392

## Warnings

- none
