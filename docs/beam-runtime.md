# BEAM Runtime

This repo's BEAM integration still depends on the upstream evaluator from `mohammadtavakoli78/BEAM`.

This document pins the upstream source and the local bootstrap path used here so later execution work has a stable baseline.

The current goal is a staged path to reproducibility, not a false claim of a fully solved end-to-end runtime.

## Upstream source

- Upstream repo: `https://github.com/mohammadtavakoli78/BEAM`
- Pinned upstream commit for the current runtime snapshot: `3e12035532eb85768f1a7cd779832b650c4b2ef9`
- Expected local checkout path by default: `vendor/BEAM`
- Expected upstream entrypoints used by `akm-eval`:
  - `src/beam/download_dataset.py`
  - `src/evaluation/run_evaluation.py`
  - `requirements.txt`

## Dataset source expectations

- Default dataset source is upstream BEAM's own dataset preparation flow.
- Upstream README points to Hugging Face datasets `Mohammadta/BEAM` and `Mohammadta/BEAM-10M`.
- `akm-eval` still expects those official dataset directories to already exist before BEAM evaluation runs.
- This slice does not vendor the datasets or replace upstream dataset preparation.
- Runtime preflight now fails early if the prepared dataset root cannot be found.
- Supported overrides for prepared datasets:
  - `pack.config.datasetPath` or `BEAM_DATASET_PATH`
  - `pack.config.dataset10MPath` or `BEAM_DATASET_10M_PATH`

## Runtime bootstrap

- `requirements-beam.txt` is a checked-in snapshot of `vendor/BEAM/requirements.txt` from the pinned upstream commit above.
- `scripts/setup-beam-runtime.sh` creates a local `.venv-beam` or runs a layout/runtime check with `--check`.
- When the BEAM checkout is a real git worktree and `git` is available, the script verifies that `HEAD` exactly matches the pinned commit above.
- If the checkout is only a copied directory without git metadata, the script can still verify the expected files and pinned requirements snapshot, but it cannot prove the original git commit.
- Default interpreter target is `python3.11` because the upstream requirements currently include a heavy stack that is not validated here across broader Python versions.
- Additional runtime overrides:
  - `pack.config.repoPath` or `BEAM_REPO_PATH`
  - `pack.config.pythonBin` or `BEAM_PYTHON_BIN`

Example preflight:

```bash
bash scripts/setup-beam-runtime.sh --check --require-judge
```

This verifies:

- pinned upstream repo layout
- pinned Python interpreter version target
- checked-in requirements snapshot matches upstream `requirements.txt`
- prepared dataset root exists
- judge credentials are present when `--require-judge` is used

Example:

```bash
bash scripts/setup-beam-runtime.sh --check
bash scripts/setup-beam-runtime.sh
```

## Judge path expectations

- The upstream BEAM evaluation path still requires a real judge model.
- `akm-eval` now fails preflight when no judge configuration is available.
- Supported judge inputs today:
  - `OPENAI_API_KEY` with the upstream default OpenAI endpoint
  - `OPENAI_BASE_URL` for an OpenAI-compatible local judge endpoint, with any needed API key handled by that endpoint

This reduces wasted runs by surfacing missing credentials before answer generation starts.

## Optional container scaffold

- `tools/beam/Dockerfile` provides a pinned `python:3.11.12-slim-bookworm` base plus the checked-in `requirements-beam.txt`.
- `tools/beam/run-in-container.sh` runs repo commands inside that local image while mounting the current checkout and passing BEAM dataset/judge env vars through.
- This is an optional staging tool for reducing host drift; it is not presented as a complete containerized BEAM solution.

Example:

```bash
tools/beam/run-in-container.sh --build -- bash scripts/setup-beam-runtime.sh --check --require-judge
```

## What this does not solve yet

- It does not prove the full upstream BEAM evaluator installs cleanly on every host.
- It does not make BEAM one-command reproducible end to end.
- It does not prepare or mirror the upstream datasets inside this repo.
- It does not remove the need for a real upstream judge model path and credentials.
- It does not pin host Docker, kernel, CUDA, or other non-Python system layers.
- The container scaffold pins only a Python base image tag and Python dependency install path; it does not freeze image digests or GPU/runtime details.

This is a practical next slice: a pinned source reference, a checked-in Python requirements snapshot, explicit dataset and judge preflight checks, and an optional container scaffold for a narrower Python runtime baseline.
