# beam

This folder contains the official BEAM integration for `akm-eval`.

- `adapter.ts`: runs BEAM conversations through the configured agent runner, then invokes the upstream evaluator
- `official.ts`: runtime checks, dataset resolution, answer-file generation, and upstream evaluation orchestration

Requirements:

- local checkout of the official `mohammadtavakoli78/BEAM` repo
- repo available via `pack.config.repoPath`, `vendor/BEAM`, or `third_party/BEAM`
- official dataset directories prepared before running the pack
- Python available for the upstream evaluator
- `OPENAI_API_KEY` available for the upstream BEAM judge path

Runner support:

- `opencode`: supported for answer generation
- `openai-compatible`: supported for answer generation
- evaluation still happens through BEAM's own upstream judge flow

The pack does not use local heuristic scoring. It normalizes only the authoritative BEAM evaluation artifacts.
