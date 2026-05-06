# beam

This folder contains the official BEAM integration for `akm-eval`.

- `adapter.ts`: runs BEAM conversations through the configured agent runner, then invokes the upstream evaluator
- `official.ts`: runtime checks, dataset resolution, answer-file generation, and upstream evaluation orchestration

Requirements:

- local checkout of the official `mohammadtavakoli78/BEAM` repo
- repo available via `pack.config.repoPath`, `vendor/BEAM`, or `third_party/BEAM`
- official dataset directories prepared before running the pack
- Python available for the upstream evaluator
- local runtime bootstrap in this repo currently targets `python3.11` via `scripts/setup-beam-runtime.sh`
- `OPENAI_API_KEY` available for the upstream BEAM judge path
- pinned upstream/runtime notes live in `docs/beam-runtime.md`

Runner support:

- `opencode`: supported for answer generation
- `openai-compatible`: supported for answer generation
- evaluation still happens through BEAM's own upstream judge flow

The pack does not use local heuristic scoring. It normalizes only the authoritative BEAM evaluation artifacts.

`akm-eval` does not yet ship a fully solved BEAM runtime. The current repo slice only records the pinned upstream source, a checked-in requirements snapshot, and a minimal setup/check script for the upstream evaluator environment.
