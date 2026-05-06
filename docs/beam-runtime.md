# BEAM Runtime

This repo's BEAM integration still depends on the upstream evaluator from `mohammadtavakoli78/BEAM`.

This document pins the upstream source and the local bootstrap path used here so later execution work has a stable baseline.

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

## Runtime bootstrap

- `requirements-beam.txt` is a checked-in snapshot of `vendor/BEAM/requirements.txt` from the pinned upstream commit above.
- `scripts/setup-beam-runtime.sh` creates a local `.venv-beam` or runs a layout/runtime check with `--check`.
- When the BEAM checkout is a real git worktree and `git` is available, the script verifies that `HEAD` exactly matches the pinned commit above.
- If the checkout is only a copied directory without git metadata, the script can still verify the expected files and pinned requirements snapshot, but it cannot prove the original git commit.
- Default interpreter target is `python3.11` because the upstream requirements currently include a heavy stack that is not validated here across broader Python versions.

Example:

```bash
bash scripts/setup-beam-runtime.sh --check
bash scripts/setup-beam-runtime.sh
```

## What this does not solve yet

- It does not prove the full upstream BEAM evaluator installs cleanly on every host.
- It does not make BEAM one-command reproducible end to end.
- It does not pin system packages, CUDA, or container image layers.
- It does not remove the need for a real upstream judge model path and `OPENAI_API_KEY`.

This is only the first useful slice: a pinned source reference, a checked-in Python requirements snapshot, and a repeatable local bootstrap/check script.
