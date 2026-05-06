# akm-eval

AKM Eval is a benchmark harness for running real eval packs with authoritative upstream harnesses and normalized outputs.

Trust policy:

- No benchmark pack should silently fall back to synthetic or heuristic success metrics.
- If an official harness or evaluator is not wired, the pack must fail clearly.
- Baseline and any future AKM variants should both use real model providers; the comparison axis is memory behavior, not fake vs real generation.

## Quick start

```bash
bun install
bun run download:datasets
bun test
bun run check:boundary
bun src/cli.ts doctor
```

## Execution checklist

Current execution plan: [`docs/execution-checklist.md`](./docs/execution-checklist.md)

This repo should not publish example benchmark numbers or placeholder score tables. If real reference artifacts do not exist yet, omit public score claims entirely.

## Supported packs

Runnable packs in the current repo:

- `locomo`: official LoCoMo dataset plus bundled authoritative evaluator wrapper
- `longmemeval`: official dataset plus external official evaluator command
- `beam`: official upstream BEAM repo plus upstream evaluation pipeline
- `terminal-bench`: official `tb run` harness
- `swe-bench`: official `swebench` Docker harness
- `tau-bench`: official upstream Python benchmark wrapper

Blocked pack:

- `akm-bench`: intentionally blocked until it can normalize authoritative external artifacts instead of local proxy scoring

## Runner support

| Pack | `opencode` | `openai-compatible` | Notes |
|---|---|---|---|
| `locomo` | Yes | Yes | Both runner paths work for answer generation. |
| `longmemeval` | Partial | Yes | Prefer `openai-compatible`; `opencode` can fail on large prompts because prompt transport goes through CLI argv. |
| `beam` | Yes | Yes | Both runners can generate answers; evaluation still happens through BEAM's own upstream judge flow. |
| `swe-bench` | Yes | Yes | OpenAI-compatible smoke/reference config targets Verified; current opencode smoke path still targets Lite. |
| `tau-bench` | No | Yes | Current integration maps `openai-compatible` configs to upstream `openai` provider mode. |
| `terminal-bench` | Yes | No | This repo's Terminal-Bench integration currently depends on the official opencode installed-agent path. |
| `akm-bench` | No | No | Pack is blocked. |

## Benchmark docs

- Pack details: [`docs/benchmark-packs.md`](./docs/benchmark-packs.md)
- Running evals: [`docs/running-evals.md`](./docs/running-evals.md)
- Operator guide: [`docs/operator-guide.md`](./docs/operator-guide.md)
- Contributor guide: [`docs/contributing.md`](./docs/contributing.md)
- Normalized result contract: [`docs/result-schema.md`](./docs/result-schema.md)

## Reference results

| Pack | Variant | Run ID | Date | Status | Score | Model | Runner | Benchmark | Version | Repo commit | Result |
|---|---|---|---|---|---:|---|---|---|---|---|---|
| `locomo` | `baseline` | `locomo-smoke-baseline` | `2026-05-06` | `passed` | 0.390 | `gpt_4o_mini` | `openai-compatible` | `locomo10` | `-` | `-` | `runs/reference/locomo/baseline/result.json` |
| `longmemeval` | `baseline` | `longmemeval-baseline` | `2026-05-06` | `passed` | 0.800 | `-` | `openai-compatible` | `longmemeval_s_cleaned` | `-` | `-` | `runs/reference/longmemeval/baseline/result.json` |
| `swe-bench` | `baseline` | `swe-bench-baseline` | `2026-05-06` | `warning` | 0.000 | `gpt-4o-mini` | `openai-compatible` | `SWE-bench/SWE-bench_Verified` | `-` | `-` | `runs/reference/swe-bench/baseline/result.json` |
| `tau-bench` | `baseline` | `tau-bench-baseline` | `2026-05-06` | `failed` | 0.000 | `gpt-4o-mini` | `openai-compatible` | `retail` | `-` | `-` | `runs/reference/tau-bench/baseline/result.json` |
| `terminal-bench` | `baseline` | `terminal-bench-baseline` | `2026-05-06` | `warning` | 0.000 | `opencode/gpt-4.1-mini` | `opencode` | `terminal-bench-core` | `0.1.1` | `2f4e8299bee542a379e569f2395a420be7b7df5b` | `runs/reference/terminal-bench/baseline/result.json` |

Generate a cross-run summary from committed artifacts with:

```bash
bun src/cli.ts summary --runs runs/reference --format markdown
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
bun run download:datasets

# Download a specific dataset
bun scripts/download-datasets.ts LongMemEval
bun scripts/download-datasets.ts LoCoMo
```

Datasets are auto-downloaded on first use if not present, but pre-downloading is recommended.

## BEAM Benchmark

The BEAM pack requires the official BEAM repo. Clone it into `vendor/BEAM`:

```bash
git clone https://github.com/mohammadtavakoli78/BEAM vendor/BEAM
```

Alternatively, set `pack.config.repoPath` in your config to point to an existing BEAM checkout.

For the current pinned local runtime bootstrap:

- upstream source expectation is `mohammadtavakoli78/BEAM` at commit `3e12035532eb85768f1a7cd779832b650c4b2ef9`
- install/check script: `bash scripts/setup-beam-runtime.sh`
- pinned Python requirements snapshot: `requirements-beam.txt`
- detailed notes and limits: `docs/beam-runtime.md`

The setup/check script verifies that commit when the BEAM checkout is a git repo. Without git metadata it falls back to file-layout plus pinned-requirements checks only.

This only pins the Python-side bootstrap needed to unblock later execution work. It does not claim BEAM is fully reproducible end to end yet.

## Terminal-Bench

`terminal-bench` is executed only through the official `tb` harness.

- Install the official harness with `uv tool install terminal-bench` or `pip install terminal-bench`.
- Ensure `Docker` and `python3` are available in `PATH`.
- Use an opencode-backed provider config so akm-eval can pass your configured model through to Terminal-Bench.
- For AKM variants, set `variants[].akm.configPath` to an AKM-specific opencode config.
- `src/memory/backends/akm.ts` is still a stub, so committed AKM comparison artifacts and repo-level AKM benchmark claims remain blocked today.
