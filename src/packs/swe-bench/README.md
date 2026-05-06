# swe-bench

This folder wraps the official `swebench` Python harness through a subprocess boundary.

- `adapter.ts`: loads an official dataset slice, asks the configured provider/model for patches, then runs `python -m swebench.harness.run_evaluation`
- `parse.ts`: normalizes the authoritative run report and per-instance harness reports
- `scorer.ts`: rounds the official resolved-instance fraction into akm-eval's normalized score field

Requirements:

- Docker daemon available
- official `swebench` Python package importable as `python3 -m swebench.harness.run_evaluation` (or `python`)
- a real model-backed agent provider in the akm-eval variant config

Notes:

- the adapter accepts official dataset identifiers including Lite and Verified
- the committed OpenAI-compatible smoke/reference config targets `SWE-bench/SWE-bench_Verified`, while the opencode smoke config still targets `SWE-bench/SWE-bench_Lite`
- `config/examples/swe-bench-smoke.json` also targets Lite today
- both `opencode` and `openai-compatible` runners can be used for patch generation
