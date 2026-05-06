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
- for AKM-enabled variants, `variants[].akm.configPath` must point at an AKM-specific opencode config
