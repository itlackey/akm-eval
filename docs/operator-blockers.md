# Operator blockers

This checklist covers the remaining items that cannot be completed by more repo-only coding alone. Each item needs operator action, upstream maintainer action, or an external system that this repository does not control.

Start from a committed config and direct wrapper commands such as `bin/doctor` and `bin/eval ...`.

## 1. BEAM upstream checkout and prepared datasets are still external prerequisites

Why the repo cannot finish it alone:
`beam` hard-requires the upstream `mohammadtavakoli78/BEAM` checkout plus prepared official dataset directories. This repo intentionally does not vendor the upstream repo or datasets, and `src/packs/beam/official.ts` fails when they are absent.

Concrete completion steps a human must perform:
1. Use a committed config directly.
2. Clone `https://github.com/mohammadtavakoli78/BEAM` into `vendor/BEAM` or another path passed via `pack.config.repoPath` or `BEAM_REPO_PATH`.
3. Check out commit `3e12035532eb85768f1a7cd779832b650c4b2ef9`.
4. Run the upstream BEAM dataset preparation flow so the prepared dataset roots exist for the intended chat sizes.
5. If `10M` runs are needed, prepare that dataset slice too and point `pack.config.dataset10MPath` or `BEAM_DATASET_10M_PATH` at it.

What evidence or artifacts should be captured when done:
- The BEAM git commit SHA from the checked-out upstream repo.
- The dataset root paths actually used.
- The JSON emitted by `bin/beam-doctor --print-fingerprint`.
- If `10M` is required, the fingerprint showing `dataset10M` and non-zero conversation counts.

How to verify completion in this repo afterward:
Run `bin/beam-doctor --print-fingerprint` and confirm it succeeds, reports the pinned repo layout, and records dataset conversation counts instead of failing with missing repo or dataset errors.

Sources:
`README.md`, `docs/beam-runtime.md`, `src/packs/beam/official.ts`, `src/packs/beam/README.md`

## 2. BEAM still needs a real judge endpoint and credentials outside this repo

Why the repo cannot finish it alone:
The upstream BEAM evaluator requires a real judge model path. This repository can only preflight for `OPENAI_API_KEY` or a non-default `OPENAI_BASE_URL`; it cannot provision or authorize the judge service itself.

Concrete completion steps a human must perform:
1. Decide whether the BEAM judge will use upstream OpenAI or an OpenAI-compatible endpoint.
2. Provision the required credential or endpoint outside this repo.
3. Export `OPENAI_API_KEY` for the upstream OpenAI path, or set `OPENAI_BASE_URL` and any required auth for the compatible endpoint.
4. Set `pack.config.evaluatorModel` if a non-default judge model is required.

What evidence or artifacts should be captured when done:
- The judge endpoint class used: `openai` or `openai-compatible`.
- The evaluator model name used for the run.
- The runtime fingerprint showing `beamJudgeBaseUrl` and `beamJudgeProvider`.
- Run logs showing the upstream evaluator completed.

How to verify completion in this repo afterward:
Run `bin/doctor --pack beam` and confirm it no longer fails on judge configuration. Then run a BEAM smoke config and confirm `raw-output.json` and `result.json.metadata` include `beamJudgeBaseUrl`, `beamJudgeProvider`, and `beamRuntimeFingerprint`.

Sources:
`docs/beam-runtime.md`, `src/packs/beam/official.ts`, `src/packs/beam/adapter.ts`

## Resolved items

AKM published packages and source checkouts are both containerized. Select one
with `--akm-version VERSION` or `--akm-source /absolute/path/to/checkout`; no
host AKM installation is needed. The source path is sanitized into a
content-addressed image and mounted read-only for provenance. See
[`running-evals.md`](./running-evals.md) and
[`memory-backends.md`](./memory-backends.md).

The old `mem0`, `openviking`, and `zep` stubs were removed. Cross-tool claims
must either cite a protocol-compatible published figure or use the vendor's
own documented tool and disclose both protocols; see
[`comparability.md`](./comparability.md).

## Scope note

`swe-bench` and `terminal-bench` are no longer packs in this repo — coding benchmarks moved to
[`akm-bench`](https://github.com/itlackey/akm-bench), which runs them through Harbor. See
`docs/benchmark-packs.md`. No separate external blocker was found in the current `tau-bench`
adapter code beyond the gaps listed above; it already runs through the official upstream harness
when that harness and credentials are available.
