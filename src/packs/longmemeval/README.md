# longmemeval

This folder contains the LongMemEval integration for `akm-eval`.

- `adapter.ts`: loads the official dataset, queries the configured runner, and invokes a configured official evaluator command
- `dataset.ts`: resolves the dataset path, including built-in download behavior for the official dataset file

Requirements:

- real model-backed agent provider
- `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation script or wrapper; setup/examples default to `python scripts/longmemeval-evaluator.py`
- official dataset file, either via `pack.config.datasetPath` or the built-in dataset resolver
- Python `openai` package plus `OPENAI_BASE_URL` for a local compatible evaluator endpoint or `OPENAI_API_KEY` for cloud OpenAI

Runner support:

- `openai-compatible`: preferred
- `opencode`: partial, because large LongMemEval conversation prompts can exceed CLI argv transport limits

The pack fails clearly when the official evaluator is not configured. It does not fall back to local heuristic judging.
