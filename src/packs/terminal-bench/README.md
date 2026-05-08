# terminal-bench

This folder contains the official `terminal-bench` integration.

- `adapter.ts`: invokes the official `tb run` harness and normalizes authoritative artifacts
- `parse.ts`: typed raw-artifact pass-through for official results
- `scorer.ts`: score normalization helper

Runtime requirements:

- currently blocked under the repo's no-runtime-installs architecture

Notes:

- dataset selection defaults to `terminal-bench-core==0.1.1` unless overridden in pack config
- the integration is intentionally disabled until the upstream installed-agent path can be replaced with a truthful prebuilt-image contract
- `memory.backend: akm` is still blocked repo-wide, so `akm-memory` remains a planned variant rather than a runnable truthful benchmark path
