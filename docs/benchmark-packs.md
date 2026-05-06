# Benchmark packs

The repository defines packs for `akm-bench`, `terminal-bench`, `swe-bench`, `longmemeval`, `beam`, and `locomo`.

Current trust policy:

- `longmemeval` is runnable only when you provide a real model connection and `pack.config.evaluatorCommand` that invokes the official LongMemEval evaluation flow.
- `swe-bench` is runnable only when Docker and the official `swebench` harness are installed. It uses official dataset slices plus the harness' own reports as the source of truth.
- `beam` is runnable only when the official `mohammadtavakoli78/BEAM` repo is available locally, the official dataset has already been prepared, and the upstream BEAM evaluator can run with a real judge model.
- `locomo` is runnable with the official `snap-research/locomo` dataset plus the bundled authoritative QA scoring wrapper. Answer generation still uses akm-eval's configured real model provider.
- `terminal-bench` is runnable only when the official `tb` harness, Python, and Docker are installed. It executes `tb run` and trusts only the official `results.json` and `run_metadata.json` artifacts.
- `terminal-bench` currently supports opencode-backed providers in this repo so users can keep using their configured `configPath`; AKM variants also require `variants[].akm.configPath`.
- `akm-bench` is intentionally blocked until it is wired to authoritative external harness/result artifacts.
- The repo does not emit proxy or heuristic benchmark scores for blocked packs.
