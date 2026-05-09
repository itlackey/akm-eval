# beam

This folder contains the official BEAM integration for `akm-eval`.

- `adapter.ts`: runs BEAM conversations through the configured agent runner, then invokes the upstream evaluator
- `official.ts`: runtime checks, dataset resolution, answer-file generation, and upstream evaluation orchestration

Requirements:

- local checkout of the official `mohammadtavakoli78/BEAM` repo
- repo available via `pack.config.repoPath`, `vendor/BEAM`, or `third_party/BEAM`
- official dataset directories prepared before running the pack
- Python available for the upstream evaluator
- local runtime setup in this repo currently targets a uv-managed Python 3.11 environment at `.akm/evals/venvs/beam` via `scripts/setup-beam-runtime.sh`
- `OPENAI_API_KEY` available for the upstream BEAM judge path
- pinned upstream/runtime notes live in `docs/beam-runtime.md`
- each run now records a BEAM runtime fingerprint in `result.json` metadata and `raw-output.json`

Optional preflight env overrides:

- `BEAM_REPO_PATH`
- `BEAM_DATASET_PATH`
- `BEAM_DATASET_10M_PATH`
- `BEAM_PYTHON_BIN`

Recommended preflight:

- `bin/doctor --pack beam`
- add `--require-10m` when the pack config includes `10M`
- add `--print-fingerprint` to emit a reproducibility-oriented runtime fingerprint for operator logs

Runner support:

- `opencode`: supported for answer generation
- `openai-compatible`: supported for answer generation
- evaluation still happens through BEAM's own upstream judge flow

The pack does not use local heuristic scoring. It normalizes only the authoritative BEAM evaluation artifacts.

`akm-eval` ships a pinned BEAM source reference, requirements snapshot, setup/check script, runtime preflight, and runtime fingerprints. It still depends on upstream dataset preparation and judge access.
