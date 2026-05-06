# terminal-bench

This folder contains the official `terminal-bench` integration.

- `adapter.ts`: invokes the official `tb run` harness and normalizes authoritative artifacts
- `parse.ts`: typed raw-artifact pass-through for official results
- `scorer.ts`: score normalization helper

Runtime requirements:

- official Terminal-Bench CLI installed as `tb`
- Python available in `PATH`
- Docker available in `PATH`
- opencode-backed provider config in this repo
- for `akm-no-memory` variants, `variants[].akm.configPath` must point at an AKM-specific opencode config

Notes:

- dataset selection defaults to `terminal-bench-core==0.1.1` unless overridden in pack config
- the integration trusts only official `tb run` artifacts such as `results.json` and `run_metadata.json`
- this pack is currently opencode-only in this repo because it depends on the official opencode installed-agent path
- `memory.backend: akm` is still blocked repo-wide, so `akm-memory` remains a planned variant rather than a runnable truthful benchmark path
