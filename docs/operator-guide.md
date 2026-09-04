# Operator guide

This document covers the operator exceptions and pack-specific caveats that do not belong in the default command flow.

## Use `bin/doctor`

- `bin/doctor` gives the repo-wide summary.
- `bin/doctor --pack <id>` is the preferred per-pack preflight.
- `bin/beam-doctor` is the direct BEAM setup/preflight surface when you want BEAM-specific flags such as `--require-10m` or `--print-fingerprint`.

## Container-managed packs

`beam` uses the optional Docker image target with the pinned
`requirements-beam.txt` environment under `/opt/akm-eval/venvs/beam`.
`bin/doctor --pack beam`, `bin/beam-doctor`, and `bin/eval --pack beam ...`
select it automatically. The image is intentionally much larger than the core
memory-eval image; the host never needs uv or Python.

## Important pack-specific caveats

- `beam` still requires a local `vendor/BEAM` checkout, prepared official datasets, and judge configuration.
- `longmemeval` prefers `openai-compatible`; the `opencode` CLI path can fail on very large prompts.
- `tau-bench` currently uses the upstream `openai` provider mode through `openai-compatible` config.

Coding benchmarks (`swe-bench`, `terminal-bench`) are out of scope for this repo; see
`docs/benchmark-packs.md` for the pointer to `akm-bench`.

## External blockers

Remaining blockers that the repo cannot solve by itself are tracked in [`docs/operator-blockers.md`](./operator-blockers.md).
