# Benchmark packs

This repository is scoped to memory / long-term-recall benchmarks. It defines packs for
`longmemeval`, `beam`, `locomo`, and `tau-bench`.

Standard agentic-coding benchmarks (`swe-bench`, `terminal-bench`, and akm's own task corpus, the
former `akm-bench` pack in this repo) are out of scope here. They live in the separate
[`akm-bench`](https://github.com/itlackey/akm-bench) repository, which runs them through the
Harbor benchmark-execution harness rather than the container/agent/verifier machinery this repo
used to duplicate. If you need a coding-benchmark run, go there.

Current trust policy:

- `longmemeval` is runnable only when you provide a real model connection and `pack.config.evaluatorCommand` that invokes the official LongMemEval evaluation flow. This repo ships `scripts/longmemeval-evaluator.py` as the default wrapper for committed configs. `judgedPass` comes only from that evaluator's output; the repo no longer computes it from a local heuristic.
- `beam` is runnable only when the official `mohammadtavakoli78/BEAM` repo is available locally, the official dataset has been prepared, and the upstream BEAM evaluator can run with a real judge model.
- `locomo` is runnable with the official `snap-research/locomo` dataset plus the bundled authoritative QA scoring wrapper. Answer generation still uses akm-eval's configured real model provider from the global `providers` map.
- `tau-bench` is runnable only when the official Python package is installed and the upstream JSON result file is the source of truth.
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

### External memory backends

- `none`, `raw-vector`, and `akm` are real, evaluated memory backends today. `akm` is a subprocess
  integration against the akm CLI (`^0.9`, reachable via `AKM_EVAL_AKM_CMD`); see
  `docs/memory-backends.md` for its full contract, hermetic layout, and the declared retrieval
  ceiling its frontmatter-synthesis rule sets.

### `tau-bench`

- Uses the official upstream Python benchmark package and JSON results file.
- Operator commands run through Docker like the other packs; the host is not
  the Python runtime.
- Current repo integration supports the upstream `openai` provider mode via `openai-compatible` configs.
- The benchmark is upstream-marked as outdated, so this integration is scoped to the original `tau-bench` only.

### Coding benchmarks moved to `akm-bench`

`swe-bench`, `terminal-bench`, and akm's own task corpus (the former `akm-bench` pack in this
repo) have been removed from `akm-eval`. They now live in the separate
[`akm-bench`](https://github.com/itlackey/akm-bench) repository, which runs them through Harbor
instead of duplicating a container/agent/verifier runtime here. See the top of this document for
the split rationale.
