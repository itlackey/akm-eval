# Benchmark packs

The repository defines packs for `akm-bench`, `terminal-bench`, `swe-bench`, `longmemeval`, `beam`, and `locomo`.
The repository also defines `tau-bench`.

Current trust policy:

- `longmemeval` is runnable only when you provide a real model connection and `pack.config.evaluatorCommand` that invokes the official LongMemEval evaluation flow.
- `swe-bench` is runnable only when Docker and the official `swebench` harness are installed. It uses official dataset slices plus the harness' own reports as the source of truth.
- `beam` is runnable only when the official `mohammadtavakoli78/BEAM` repo is available locally, the official dataset has already been prepared, and the upstream BEAM evaluator can run with a real judge model.
- `locomo` is runnable with the official `snap-research/locomo` dataset plus the bundled authoritative QA scoring wrapper. Answer generation still uses akm-eval's configured real model provider.
- `terminal-bench` is runnable only when the official `tb` harness, Python, and Docker are installed. It executes `tb run` and trusts only the official `results.json` and `run_metadata.json` artifacts.
- `terminal-bench` currently supports opencode-backed providers in this repo so users can keep using their configured `configPath`; AKM variants also require `variants[].akm.configPath`, but repo-facing AKM comparison claims remain blocked while `src/memory/backends/akm.ts` is still a stub.
- `tau-bench` is runnable only when the official Python package is installed and the upstream JSON result file can be treated as the source of truth.
- `akm-bench` is intentionally blocked until it is wired to authoritative external harness/result artifacts.
- The repo does not emit proxy or heuristic benchmark scores for blocked packs.

## Pack notes

### `locomo`

- Uses the official `snap-research/locomo` `locomo10.json` dataset.
- Uses the bundled `scripts/locomo-evaluator.py` wrapper to preserve authoritative QA scoring rules.
- Supports both `opencode` and `openai-compatible` runners for answer generation.
- Requires a real model provider even for baseline runs.

### `longmemeval`

- Requires a real model provider plus `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation flow.
- Dataset resolution is built in, but local heuristic judging is intentionally disabled.
- `openai-compatible` is the preferred runner path today.
- `opencode` is only partial support because large conversation prompts may exceed CLI argv transport limits.

### `beam`

- Requires a local checkout of the official `mohammadtavakoli78/BEAM` repo.
- Requires official dataset preparation before evaluation.
- Answer generation can use either supported runner path.
- Evaluation still depends on BEAM's upstream evaluator and judge model path.

### `swe-bench`

- Uses the official `swebench` Python Docker harness.
- Accepts official SWE-Bench dataset identifiers including Lite and Verified.
- The committed OpenAI-compatible smoke/reference config targets `SWE-bench/SWE-bench_Verified`; the opencode smoke config still targets `SWE-bench/SWE-bench_Lite`.
- Supports both `opencode` and `openai-compatible` runners for patch generation.

### `terminal-bench`

- Uses the official `tb run` harness only.
- Requires `tb`, Python, and Docker.
- In this repo, the integration is currently opencode-only because it depends on the official opencode installed-agent path.
- AKM variants must provide a real AKM-specific `variants[].akm.configPath`.

### `tau-bench`

- Uses the official upstream Python benchmark package and JSON results file.
- No Docker is required.
- Current repo integration supports the upstream `openai` provider mode via `openai-compatible` configs.
- The benchmark itself is upstream-marked as outdated in favor of newer repos, so this integration is scoped to the original `tau-bench` only.

### `akm-bench`

- Intentionally blocked in this repo.
- The previous local proxy-scoring behavior was removed.
- The pack should not be considered runnable until it can normalize authoritative external artifacts only.
