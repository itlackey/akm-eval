# Running evals

Use `akm-eval run` for a single pack/variant and `akm-eval matrix` for a comparison matrix.

Important constraints:

- Baseline runs for real benchmarks must still use a real model provider. Compare `memory.backend: none` against `memory.backend: akm`; do not use `provider: none`.
- `longmemeval` requires `pack.config.datasetPath` and `pack.config.evaluatorCommand` so scoring comes from the official evaluator flow.
- `locomo` uses the official `locomo10.json` dataset and the bundled `scripts/locomo-evaluator.py` scorer. If `datasets/locomo/locomo10.json` is absent, akm-eval downloads it from the official Snap Research repository on first run.
- `locomo` supports `pack.config.maxContextTokens` for baseline conversation truncation and `pack.config.topK` for memory-backed retrieval mode.
- For LongMemEval, prefer an `openai-compatible` provider today. The current `opencode run` CLI path passes prompts as argv and can reject very large LongMemEval histories.
- `swe-bench` requires Docker plus the official `swebench` Python package. The adapter generates prediction patches with the configured variant/provider, then runs `python -m swebench.harness.run_evaluation` and trusts only the harness artifacts.
- `beam` requires a local checkout of the official `mohammadtavakoli78/BEAM` repo plus its prepared official dataset directories. akm-eval generates BEAM answer files with the configured model/provider path, then runs `python -m src.evaluation.run_evaluation` from the upstream repo and trusts only those evaluation artifacts.
- `beam` also requires `OPENAI_API_KEY` for the upstream BEAM judge model and optionally `pack.config.evaluatorModel` to choose that judge.
- `terminal-bench` runs only through the official `tb run` harness. It requires `tb`, Python, Docker, and an opencode-backed provider config. If any requirement is missing, `doctor` and runtime fail clearly.
- `terminal-bench` AKM comparison runs must set `variants[].akm.configPath` to a real AKM-specific opencode config. akm-eval will not silently reuse the baseline config for an AKM run.
- `akm-bench` still fails fast with an explicit runtime error instead of producing proxy metrics.
