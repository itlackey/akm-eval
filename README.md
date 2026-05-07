# akm-eval

AKM Eval is a benchmark harness for running real eval packs with authoritative upstream harnesses and normalized outputs.

Trust policy:

- No benchmark pack should silently fall back to synthetic or heuristic success metrics.
- If an official harness or evaluator is not wired, the pack must fail clearly.
- Baseline and any future AKM variants should both use real model providers; the comparison axis is memory behavior, not fake vs real generation.

## Quick start

```bash
bun install
bin/build-image
bin/downloads
bin/doctor
bin/eval --pack locomo --variant baseline --config config/examples/locomo-smoke.json
bun test
bun run check:boundary
```

Common operator entrypoints:

- `bin/build-image`: build the operator Docker image used by the wrappers
- `bin/doctor [--pack <id>]`: environment and harness preflight summary, or a focused check for one pack
- `bin/eval --pack <pack> --variant <variant> --config <config-path> --out <output-dir>`: run one normalized eval
- `bin/matrix --config <config-path>`: show the planned matrix from a config
- `bin/report --run <run-dir>`: render one normalized run
- `bin/summary --runs <runs-dir> --format markdown`: summarize a run tree
- `bin/compare --baseline <run-dir> --candidate <run-dir>`: compare two normalized runs
- `bin/downloads [DatasetName]`: fetch repo-managed datasets
- `bin/beam-doctor`: BEAM-specific repo, dataset, and judge preflight
- `bin/setup`: guided starter-config helper in Docker
- `bun run setup:legacy`: legacy direct-engine setup helper if you explicitly want it

The internal Bun CLI remains the execution engine, but the normal operator path now goes through `bin/` wrappers so harness-backed and script-based packs run inside the same Docker boundary.

## Execution checklist

Current execution plan: [`docs/execution-checklist.md`](./docs/execution-checklist.md)

This repo should not publish example benchmark numbers or placeholder score tables. If real reference artifacts do not exist yet, omit public score claims entirely.

## Supported packs

Runnable packs in the current repo:

- `locomo`: official LoCoMo dataset plus bundled authoritative evaluator wrapper
- `longmemeval`: official dataset plus external official evaluator command
- `beam`: official upstream BEAM repo plus upstream evaluation pipeline, with repo-side preflight/bootstrap support but no committed end-to-end reference run yet
- `terminal-bench`: official `tb run` harness
- `swe-bench`: official `swebench` Docker harness
- `tau-bench`: official upstream Python benchmark wrapper

Blocked pack:

- `akm-bench`: intentionally blocked until it can normalize authoritative external artifacts instead of local proxy scoring

Blocked memory-backend comparison paths:

- `akm`, `mem0`, `zep`, and `openviking` currently fail explicitly instead of pretending to provide evaluated retrieval behavior in benchmark runs
- `akm` is blocked specifically because the repo can verify `akm --help` and `akm info --format json`, but `akm memory --help` still does not expose a documented indexing/query contract that can be mapped truthfully onto this repo's retrieval interface

## Runner support

| Pack | `opencode` | `openai-compatible` | Notes |
|---|---|---|---|
| `locomo` | Yes | Yes | Both runner paths work for answer generation. |
| `longmemeval` | Partial | Yes | Prefer `openai-compatible`; `opencode` can fail on large prompts because prompt transport goes through CLI argv. |
| `beam` | Yes | Yes | Both runners can generate answers; evaluation still depends on upstream dataset prep and judge/runtime prerequisites. |
| `swe-bench` | Yes | Yes | OpenAI-compatible smoke/reference config targets Verified; current opencode smoke path still targets Lite. |
| `tau-bench` | No | Yes | Current integration maps `openai-compatible` configs to upstream `openai` provider mode. |
| `terminal-bench` | Yes | No | This repo's Terminal-Bench integration currently depends on the official opencode installed-agent path. |
| `akm-bench` | No | No | Pack is blocked. |

## Benchmark docs

- Pack details: [`docs/benchmark-packs.md`](./docs/benchmark-packs.md)
- Running evals: [`docs/running-evals.md`](./docs/running-evals.md)
- Operator guide: [`docs/operator-guide.md`](./docs/operator-guide.md)
- Operator-only remaining blockers: [`docs/operator-blockers.md`](./docs/operator-blockers.md)
- Contributor guide: [`docs/contributing.md`](./docs/contributing.md)
- Normalized result contract: [`docs/result-schema.md`](./docs/result-schema.md)

## Reference results

| Pack | Variant | Run ID | Date | Status | Score | Model | Runner | Benchmark | Version | Repo commit | Result |
|---|---|---|---|---|---:|---|---|---|---|---|---|
| `locomo` | `baseline` | `locomo-smoke-baseline` | `2026-05-06` | `passed` | 0.390 | `gpt_4o_mini` | `openai-compatible` | `locomo10` | `-` | `2f4e8299bee542a379e569f2395a420be7b7df5b` | `runs/reference/locomo/baseline/result.json` |
| `longmemeval` | `baseline` | `longmemeval-baseline` | `2026-05-06` | `passed` | 0.800 | `-` | `openai-compatible` | `longmemeval_s_cleaned` | `-` | `2f4e8299bee542a379e569f2395a420be7b7df5b` | `runs/reference/longmemeval/baseline/result.json` |
| `swe-bench` | `baseline` | `swe-bench-baseline` | `2026-05-06` | `warning` | 0.000 | `gpt-4o-mini` | `openai-compatible` | `SWE-bench/SWE-bench_Verified` | `-` | `-` | `runs/reference/swe-bench/baseline/result.json` |
| `tau-bench` | `baseline` | `tau-bench-baseline` | `2026-05-06` | `failed` | 0.000 | `gpt-4o-mini` | `openai-compatible` | `retail` | `-` | `-` | `runs/reference/tau-bench/baseline/result.json` |
| `terminal-bench` | `baseline` | `terminal-bench-baseline` | `2026-05-06` | `warning` | 0.000 | `opencode/gpt-4.1-mini` | `opencode` | `terminal-bench-core` | `0.1.1` | `2f4e8299bee542a379e569f2395a420be7b7df5b` | `runs/reference/terminal-bench/baseline/result.json` |

Generate a cross-run summary from committed artifacts with:

```bash
bin/summary --runs runs/reference --format markdown
```

## Current critical path

1. Document the shipped packs and runner limitations accurately.
2. Expand the normalized result schema documentation into a real public contract.
3. Publish real reference artifacts for one memory pack, `terminal-bench`, and `swe-bench`; AKM-vs-baseline reference comparisons remain blocked until the AKM backend stops being a stub.
4. Add CI for `bun test` and `bun run check:boundary`.
5. Phase 6 completed with `tau-bench` as the chosen non-memory expansion pack.

## SWE-Bench note

The `swe-bench` adapter accepts official dataset identifiers including Verified. The committed OpenAI-compatible smoke/reference config now targets `SWE-bench/SWE-bench_Verified`, while the opencode smoke config still targets Lite.

## Datasets

Dataset files are not committed to the repository due to their size. Download them before running evals:

```bash
# Download all datasets
bin/downloads

# Download a specific dataset
bin/downloads LongMemEval
bin/downloads LoCoMo
```

Datasets are auto-downloaded on first use if not present, but pre-downloading is recommended.

## Wrapper-first operator flow

Primary operator flow starts from a committed example config plus direct wrapper commands:

```bash
bin/doctor
bin/doctor --pack locomo
bin/matrix --config config/examples/locomo-smoke.json
bin/eval --pack locomo --variant baseline --config config/examples/locomo-smoke.json
```

Use the closest committed example config for the pack you want to run:

- `config/examples/locomo-smoke.json`
- `config/examples/longmemeval-smoke.json`
- `config/examples/beam-smoke.json`
- `config/examples/swe-bench-smoke.json`
- `config/examples/swe-bench-smoke-openai-compatible.json`
- `config/examples/tau-bench-smoke.json`
- `config/examples/terminal-bench-smoke.json`

Write a direct `version: 1` config when you need custom runs. Declare provider connections once under top-level `providers`, have each run select one with `agentProvider`, and use `agentModel` only for per-run overrides.

Preferred preflight flow:

- run `bin/doctor` for the central repo-wide summary across packs and memory backends
- run `bin/doctor --pack <id>` when you want the preferred wrapper-level status for one pack before using its example config
- keep dedicated pack wrappers only where they add materially different checks beyond the shared doctor surface; `bin/beam-doctor` remains that deeper BEAM-specific preflight

## Legacy guided setup

The guided setup helper still exists, but it is no longer the primary path:

```bash
bun run setup:legacy
```

The legacy setup flow:

- asks which packs to include
- asks for the minimum global provider connection config and default model values needed to start
- shows the detected runtime status for the selected packs using the same checks as `bin/doctor`
- optionally downloads repo-managed datasets for `locomo` and `longmemeval`; answering no skips downloads and only writes the config
- optionally runs a deeper read-only BEAM preflight; answering no skips that check
- writes a legacy starter config file that declares provider connections once at the top level and has runs select them with `agentProvider`, with `agentModel` left for per-run overrides when needed, without claiming external blockers are solved

For `openai-compatible` providers, blank API keys are allowed for local no-auth endpoints such as LM Studio.

It keeps external prerequisites explicit. For example, it can run BEAM's existing repo-side preflight, but it does not clone the upstream BEAM repo, prepare BEAM datasets, install Docker, or provision external credentials for SWE-Bench, Terminal-Bench, or Tau-Bench.

## BEAM Benchmark

The BEAM pack requires the official BEAM repo. Clone it into `vendor/BEAM`:

```bash
git clone https://github.com/mohammadtavakoli78/BEAM vendor/BEAM
```

Alternatively, set `pack.config.repoPath` in your config to point to an existing BEAM checkout.

For the current pinned local runtime bootstrap:

- upstream source expectation is `mohammadtavakoli78/BEAM` at commit `3e12035532eb85768f1a7cd779832b650c4b2ef9`
- install/check script: `bash scripts/setup-beam-runtime.sh`
- wrapper-level pack check: `bin/doctor --pack beam`
- deeper BEAM-specific preflight: `bin/beam-doctor`
- pinned Python requirements snapshot: `requirements-beam.txt`
- optional env overrides: `BEAM_REPO_PATH`, `BEAM_DATASET_PATH`, `BEAM_DATASET_10M_PATH`, `BEAM_PYTHON_BIN`
- optional container scaffold: `tools/beam/Dockerfile` and `tools/beam/run-in-container.sh`
- runtime evidence capture: `--print-fingerprint` from the setup/check script and `beamRuntimeFingerprint` in run artifacts
- detailed notes and limits: `docs/beam-runtime.md`

The setup/check script verifies that commit when the BEAM checkout is a git repo. Without git metadata it falls back to file-layout plus pinned-requirements checks only.

It now also fails early when the prepared dataset path is missing, and it can require judge credentials during preflight with `--require-judge`.

Minimum truthful preflight today:

```bash
bin/doctor --pack beam
bin/beam-doctor
bash scripts/setup-beam-runtime.sh --check --require-judge
bash scripts/setup-beam-runtime.sh --check --require-judge --print-fingerprint
# add --require-10m when running 10M chat sizes
```

If you use the container helper, it now remaps external BEAM repo and dataset paths into the container instead of passing host-only absolute paths through unchanged.

If you want container-side evidence too, use `tools/beam/run-in-container.sh --print-image-fingerprint` to record the local image ID that was actually run.

This only pins the Python-side bootstrap needed to unblock later execution work. It does not claim BEAM is fully reproducible end to end yet.

## Terminal-Bench

`terminal-bench` is executed only through the official `tb` harness.

- Install the official harness with `uv tool install terminal-bench` or `pip install terminal-bench`.
- Ensure `Docker` and `python3` are available in `PATH`.
- Use an opencode-backed provider config so akm-eval can pass your configured model through to Terminal-Bench.
- For `akm-no-memory` terminal-bench variants, set `variants[].akm.configPath` to an AKM-specific opencode config.
- `src/memory/backends/akm.ts` now reports AKM CLI/runtime metadata and fails explicitly when retrieval is requested; it still does not implement a truthful evaluated AKM retrieval path, because the current documented AKM CLI surface does not yet expose a repo-mappable memory add/search contract.
