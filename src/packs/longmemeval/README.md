# longmemeval

This folder contains the LongMemEval integration for `akm-eval`.

- `adapter.ts`: loads the official dataset, queries the configured runner, and invokes an external official evaluator command
- `dataset.ts`: resolves the dataset path, including built-in download behavior for the official dataset file

Requirements:

- real model-backed agent provider
- `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation script or wrapper
- official dataset file, either via `pack.config.datasetPath` or the built-in dataset resolver

Runner support:

- `openai-compatible`: preferred
- `opencode`: partial, because large LongMemEval conversation prompts can exceed CLI argv transport limits

The pack fails clearly when the official evaluator is not configured. It does not fall back to local heuristic judging.
