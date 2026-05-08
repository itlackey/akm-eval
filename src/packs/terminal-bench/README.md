# terminal-bench

This folder contains the official `terminal-bench` integration.

- `adapter.ts`: invokes the official `tb run` harness and normalizes authoritative artifacts
- `parse.ts`: typed raw-artifact pass-through for official results
- `scorer.ts`: score normalization helper

Runtime requirements:

- host-side `tb` harness installed in a repo-local uv-managed environment under `.akm/evals/venvs/terminal-bench`, set up automatically by `bin/doctor --pack terminal-bench` and `bin/eval --pack terminal-bench ...`
- Docker on the host
- an `opencode` provider config plus required env vars

Notes:

- dataset selection defaults to `terminal-bench-core==0.1.1` unless overridden in pack config
- the upstream installed-agent setup may install Node 22 and `opencode-ai` inside benchmark containers during the run
- `memory.backend: akm` is still blocked repo-wide, so `akm-memory` remains a planned variant rather than a runnable truthful benchmark path
