# Operator guide

This document covers the operator exceptions and pack-specific caveats that do not belong in the default command flow.

## Use `bin/doctor`

- `bin/doctor` gives the repo-wide summary.
- `bin/doctor --pack <id>` is the preferred per-pack preflight.
- `bin/beam-doctor` is the direct BEAM setup/preflight surface when you want BEAM-specific flags such as `--require-10m` or `--print-fingerprint`.

## Host-managed packs

These packs use repo-local uv-managed runtimes under `.akm/evals/venvs/`:

- `beam`
- `swe-bench`
- `terminal-bench`

They are set up automatically by `bin/doctor --pack ...` and `bin/eval --pack ...`.

## Important pack-specific caveats

- `beam` still requires a local `vendor/BEAM` checkout, prepared official datasets, and judge configuration.
- `terminal-bench` currently requires the `opencode` provider path.
- `longmemeval` prefers `openai-compatible`; the `opencode` CLI path can fail on very large prompts.
- `tau-bench` currently uses the upstream `openai` provider mode through `openai-compatible` config.

## External blockers

Remaining blockers that the repo cannot solve by itself are tracked in [`docs/operator-blockers.md`](./operator-blockers.md).
