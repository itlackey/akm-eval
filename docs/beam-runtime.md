# BEAM Runtime

This repo's BEAM integration depends on the upstream evaluator from `mohammadtavakoli78/BEAM`.

This document pins the upstream source and local runtime-setup path used here.

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

## Runtime setup

- `requirements-beam.txt` is a checked-in snapshot of `vendor/BEAM/requirements.txt` from the pinned upstream commit.
- `scripts/setup-beam-runtime.sh` is the pack-local setup script used by `bin/doctor --pack beam`, `bin/beam-doctor`, and `bin/eval --pack beam ...`; it creates `.akm/evals/venvs/beam` and verifies the BEAM repo, dataset, and judge path.
- When the BEAM checkout is a real git worktree and `git` is available, the script verifies that `HEAD` matches the pinned commit.
- Use `--require-10m` when the planned BEAM run includes `10M` chat sizes.
- Use `--print-fingerprint` to emit repo path, commit, Python version, requirements hash status, judge class, and dataset counts.
- If the checkout is only a copied directory without git metadata, the script still verifies the expected files and requirements snapshot.
- Default `uv` Python target is `3.11`.
- Additional runtime overrides:
  - `pack.config.repoPath` or `BEAM_REPO_PATH`
  - `pack.config.pythonBin` or `BEAM_PYTHON_BIN`

Example preflight:

```bash
bin/doctor --pack beam
bin/beam-doctor
```

This verifies:

- pinned upstream repo layout
- pinned Python interpreter target
- requirements snapshot matches upstream `requirements.txt`
- prepared dataset root exists
- optional prepared 10M dataset root exists when `--require-10m` is used
- judge credentials are present when `--require-judge` is used
- optional runtime fingerprint JSON is emitted when `--print-fingerprint` is used

The fingerprint captures evidence for the repo path, requirements snapshot, dataset roots, and judge endpoint class.

Example:

```bash
git clone https://github.com/mohammadtavakoli78/BEAM vendor/BEAM
git -C vendor/BEAM checkout 3e12035532eb85768f1a7cd779832b650c4b2ef9
# prepare datasets with the upstream BEAM flow
bin/doctor --pack beam
```

## Minimum operator flow

1. Clone the upstream BEAM repo at the pinned commit.
2. Prepare the official dataset with upstream BEAM tooling.
3. Run `bin/doctor --pack beam`, then `bin/beam-doctor` before BEAM evals that need deeper validation.
4. Add `--require-10m` when the config requests `10M` chat sizes.
5. Capture the fingerprint JSON alongside run logs when you need auditability.

## Judge path expectations

- The upstream BEAM evaluation path still requires a real judge model.
- `akm-eval` now fails preflight when no judge configuration is available.
- Supported judge inputs today:
  - `OPENAI_API_KEY` with the upstream default OpenAI endpoint
  - `OPENAI_BASE_URL` for an OpenAI-compatible local judge endpoint, with any needed API key handled by that endpoint

This reduces wasted runs by surfacing missing credentials before answer generation starts.

This reduces wasted runs by surfacing missing credentials before answer generation starts.
