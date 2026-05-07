# tau-bench

This folder contains the `tau-bench` integration for `akm-eval`.

- `adapter.ts`: runs the official upstream package through a thin wrapper and normalizes the authoritative JSON results
- `parse.ts`: validates and summarizes the upstream results file
- `scorer.ts`: rounds the normalized aggregate score

Requirements:

- Python available in `PATH`
- official `tau-bench` package installed in the Python environment
- real model-backed provider credentials

Current support in this repo:

- environment support: `retail` and `airline`
- provider support: `openai-compatible` configs mapped to upstream `openai`
- runner support: no `opencode` path yet

Notes:

- upstream `tau-bench` is explicitly documented as outdated in favor of newer repos, so this integration should be understood as wrapping the original benchmark only
- `akm-eval` trusts the upstream JSON result file as the source of truth and does not synthesize scores outside that artifact
- the wrapper normalizes model and user-model strings for checkpoint/result filenames only; upstream API calls still use the original configured model names
- the shipped smoke/setup path runs a single task; treat that as a smoke-only runtime example rather than a full-run duration expectation
