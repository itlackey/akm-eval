# Benchmark packs

The repository defines packs for `akm-bench`, `terminal-bench`, `swe-bench`, `longmemeval`, `beam`, and `locomo`.
The repository also defines `tau-bench`.

Current trust policy:

- `longmemeval` is runnable only when you provide a real model connection and `pack.config.evaluatorCommand` that invokes the official LongMemEval evaluation flow. This repo ships `scripts/longmemeval-evaluator.py` as the default wrapper for committed configs.
- `swe-bench` is runnable only when Docker and the official `swebench` harness are installed. It uses official dataset slices and harness reports as the source of truth.
- `beam` is runnable only when the official `mohammadtavakoli78/BEAM` repo is available locally, the official dataset has been prepared, and the upstream BEAM evaluator can run with a real judge model.
- `locomo` is runnable with the official `snap-research/locomo` dataset plus the bundled authoritative QA scoring wrapper. Answer generation still uses akm-eval's configured real model provider from the global `providers` map.
- `terminal-bench` is runnable through the official `tb run` harness with an `opencode` installed-agent path. The host wrapper bootstraps the official harness with `uv`, and the installed-agent setup may install Node 22 plus `opencode-ai` inside benchmark containers.
- `tau-bench` is runnable only when the official Python package is installed and the upstream JSON result file is the source of truth.
- `akm-bench` is intentionally blocked until it is wired to authoritative external harness/result artifacts.
- The repo does not emit proxy or heuristic benchmark scores for blocked packs.

## Pack notes

### `locomo`

- Uses the official `snap-research/locomo` `locomo10.json` dataset.
- Uses the bundled `scripts/locomo-evaluator.py` wrapper to preserve authoritative QA scoring rules.
- Supports both `opencode` and `openai-compatible` runners for answer generation.
- Requires a real model provider even for baseline runs.

### `longmemeval`

- Requires a real model provider plus `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation flow. This repo ships `scripts/longmemeval-evaluator.py` as the default wrapper for committed configs.
- Dataset resolution is built in, but local heuristic judging is intentionally disabled.
- `openai-compatible` is the preferred runner path today.
- `opencode` is only partial support because large conversation prompts may exceed CLI argv transport limits.

### `beam`

- Requires a local checkout of the official `mohammadtavakoli78/BEAM` repo and prepared official datasets.
- Answer generation can use either supported runner path.
- Evaluation still depends on BEAM's upstream evaluator and judge model path.
- Repo-side preflight checks cover prepared dataset roots, judge configuration, optional `--require-10m`, and runtime fingerprint capture.

### `swe-bench`

- Uses the official `swebench` Python Docker harness.
- Accepts official SWE-Bench dataset identifiers including Lite and Verified.
- The committed OpenAI-compatible smoke config targets `SWE-bench/SWE-bench_Verified`; the opencode smoke config targets `SWE-bench/SWE-bench_Lite`.
- Supports both `opencode` and `openai-compatible` runners for patch generation.

### `terminal-bench`

- Uses the official `tb run` harness only.
- Requires Docker, `uv`, and an `opencode` config on the host.
- Runs through a repo-local `uv` environment under `.akm/evals/venvs/terminal-bench`.
- The upstream installed-agent path may install Node 22 and `opencode-ai` inside benchmark containers.

### External memory backends

- `none` and `raw-vector` are the only runnable memory backends today.
- `akm`, `mem0`, `openviking`, and `zep` remain blocked and fail explicitly instead of pretending to be evaluated integrations.

### `tau-bench`

- Uses the official upstream Python benchmark package and JSON results file.
- No Docker is required.
- Current repo integration supports the upstream `openai` provider mode via `openai-compatible` configs.
- The benchmark is upstream-marked as outdated, so this integration is scoped to the original `tau-bench` only.

### `akm-bench`

- Intentionally blocked until it can normalize authoritative external artifacts only.
