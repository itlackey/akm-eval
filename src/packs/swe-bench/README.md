# swe-bench

This folder wraps the official `swebench` Python harness through a subprocess boundary.

- `adapter.ts`: loads an official dataset slice, asks the configured provider/model for patches, then runs `python -m swebench.harness.run_evaluation`
- `parse.ts`: normalizes the authoritative run report and per-instance harness reports
- `scorer.ts`: rounds the official resolved-instance fraction into akm-eval's normalized score field

Requirements:

- Docker daemon available
- `bin/doctor --pack swe-bench` and `bin/swe-bench-eval` will ensure a repo-local uv-managed environment at `.akm/evals/venvs/swe-bench` for the official harness
- a real model-backed agent provider in the akm-eval variant config

Notes:

- the adapter accepts official dataset identifiers including Lite and Verified
- the committed OpenAI-compatible smoke config targets `SWE-bench/SWE-bench_Verified`; the opencode smoke config targets `SWE-bench/SWE-bench_Lite`
- both `opencode` and `openai-compatible` runners can be used for patch generation
