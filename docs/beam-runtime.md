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
- Use `--require-10m` when the planned BEAM run includes `10M` chat sizes so preflight fails before execution if that dataset slice is absent.
- Use `--print-fingerprint` to emit a JSON runtime fingerprint that records repo path/origin, repo commit when available, Python version, normalized requirements hashes plus match status, judge endpoint class, and dataset conversation counts.
- If the checkout is only a copied directory without git metadata, the script can still verify the expected files and pinned requirements snapshot, but it cannot prove the original git commit.
- Default interpreter target is `python3.11` because the upstream requirements currently include a heavy stack that is not validated here across broader Python versions.
- Additional runtime overrides:
  - `pack.config.repoPath` or `BEAM_REPO_PATH`
  - `pack.config.pythonBin` or `BEAM_PYTHON_BIN`

Example preflight:

```bash
bin/beam-doctor
bash scripts/setup-beam-runtime.sh --check --require-judge
bash scripts/setup-beam-runtime.sh --check --require-10m --require-judge
bash scripts/setup-beam-runtime.sh --check --require-judge --print-fingerprint
```

This verifies:

- pinned upstream repo layout
- pinned Python interpreter version target
- checked-in requirements snapshot matches upstream `requirements.txt`
- prepared dataset root exists
- optional prepared 10M dataset root exists when `--require-10m` is used
- judge credentials are present when `--require-judge` is used
- optional runtime fingerprint JSON is emitted when `--print-fingerprint` is used

The fingerprint is evidence capture, not a completeness claim. It can prove which repo path, requirements snapshot, dataset roots, and judge endpoint class were used for a run in this repo slice, but it does not prove the provenance of upstream-prepared datasets or the remote judge implementation.

Example:

```bash
git clone https://github.com/mohammadtavakoli78/BEAM vendor/BEAM
git -C vendor/BEAM checkout 3e12035532eb85768f1a7cd779832b650c4b2ef9
# prepare datasets with the upstream BEAM flow
bash scripts/setup-beam-runtime.sh --check
bash scripts/setup-beam-runtime.sh
```

## Minimum truthful operator flow

1. Clone the upstream BEAM repo at the pinned commit.
2. Prepare the official dataset outside this repo using the upstream BEAM dataset flow.
3. Run `bin/beam-doctor` before any BEAM eval.
4. Add `--require-10m` when the config requests `10M` chat sizes.
5. Capture the emitted fingerprint JSON alongside run logs when you need stronger auditability.

This keeps the repo-side workflow explicit without pretending dataset preparation or judge access are solved here.

## Judge path expectations

- The upstream BEAM evaluation path still requires a real judge model.
- `akm-eval` now fails preflight when no judge configuration is available.
- Supported judge inputs today:
  - `OPENAI_API_KEY` with the upstream default OpenAI endpoint
  - `OPENAI_BASE_URL` for an OpenAI-compatible local judge endpoint, with any needed API key handled by that endpoint

This reduces wasted runs by surfacing missing credentials before answer generation starts.

## Optional container scaffold

- `tools/beam/Dockerfile` provides a pinned `python:3.11.12-slim-bookworm` base plus the checked-in `requirements-beam.txt`.
- `tools/beam/run-in-container.sh` runs repo commands inside that local image while mounting the current checkout and remapping BEAM repo/dataset paths into the container.
- `tools/beam/run-in-container.sh --print-image-fingerprint` prints the local Docker image ID and creation timestamp so operators can record the exact built image they used.
- This is an optional staging tool for reducing host drift; it is not presented as a complete containerized BEAM solution.

Example:

```bash
tools/beam/run-in-container.sh --build --print-image-fingerprint -- bash scripts/setup-beam-runtime.sh --check --require-judge --print-fingerprint
```

## What this does not solve yet

- It does not prove the full upstream BEAM evaluator installs cleanly on every host.
- It does not make BEAM one-command reproducible end to end.
- It does not prepare or mirror the upstream datasets inside this repo.
- It does not remove the need for a real upstream judge model path and credentials.
- It does not pin host Docker, kernel, CUDA, or other non-Python system layers.
- The container scaffold pins a Python base image tag and Python dependency install path, and can report the locally built image ID for evidence capture; it still does not freeze upstream registry digests, host Docker behavior, GPU/runtime details, or non-container host layers.

This is a practical next slice: a pinned source reference, a checked-in Python requirements snapshot, explicit dataset and judge preflight checks, runtime fingerprint capture, and an optional container scaffold for a narrower Python runtime baseline.
