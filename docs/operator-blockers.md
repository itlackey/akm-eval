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

## 3. Source-checkout AKM targets still need an explicit mount

Why the repo cannot finish it alone:
`src/memory/backends/akm.ts` is now a real, evaluated integration — every operation shells out to a
real akm CLI process (`akm remember`/`akm search`/`akm bundle create`/`akm index --full`), with a
deterministic frontmatter-synthesis step, per-instance hermetic state, and fail-loud
ingestion-count verification. See `docs/memory-backends.md` for the full contract, and
`tests/memory-backend-akm.test.ts` / `tests/memory-backend-akm.integration.test.ts` for its test
coverage (the latter a real, no-mocking round trip against a live akm CLI). This was previously
written as a repo-internal implementation gap; that gap is closed.

Published versions no longer have a host dependency: the wrapper installs the
selected CLI while building its version-specific image. Only source-checkout
testing needs an external path made reachable inside the container.

**Container path:** the documented wrappers build/select an image tagged for
the exact `AKM_EVAL_AKM_VERSION`; that image contains the matching published
CLI. `bin/probe` requires `--akm-version` (or `--cmd`), and
`bin/memory-eval` requires `--akm-version` whenever the `akm-memory` arm is
selected, then verifies the command's reported version before any paid calls.
For a source command outside this checkout, set `AKM_EVAL_AKM_SOURCE_DIR` so
the wrapper mounts that source read-only at the same absolute path.

Concrete completion steps a human must perform:
1. Select a published CLI with `--akm-version VERSION`, or point
   `AKM_EVAL_AKM_CMD` at an alternate invocation and mount its checkout with
   `AKM_EVAL_AKM_SOURCE_DIR`.
2. Keep the expected `AKM_EVAL_AKM_VERSION` explicit for a judged source run;
   a version mismatch is fatal before model calls.
3. Confirm reachability with `bin/doctor` (or `akm-eval doctor`) and check the `memory:akm` line.

What evidence or artifacts should be captured when done:
- The `memory:akm` doctor line reporting `status: ok` and the resolved akm version.
- A completed run's `metadata` in its `result.json`, which records `memoryBackend: "akm"`.

How to verify completion in this repo afterward:
Run `bin/doctor` and confirm `memory:akm` is `OK` (not `WARN`); run
`AKM_EVAL_AKM_VERSION=<version> bin/eval --pack <pack> --variant akm-memory
--config config/common/locomo-akm-ab.json` (or the LongMemEval equivalent) and
confirm it does not fail with an akm-unreachable error.

Sources:
`docs/memory-backends.md`, `src/memory/backends/akm.ts`, `src/memory/registry.ts`,
`config/common/locomo-akm-ab.json`, `config/common/longmemeval-akm-ab.json`

## 4. RESOLVED BY REMOVAL — competitor backends are no longer in this repo

`mem0`, `openviking` and `zep` were removed rather than implemented. They were
stub backends that failed loudly; standing them up would have made this repo
responsible for configuring a competitor's product well enough to publish a
number against it, and an under-configured rival is a strawman, not a baseline
(`docs/comparability.md` A8).

Cross-tool comparison now takes one of two forms, neither of which is a
blocker on this repo:

1. **Cite their published figure.** Only valid once our own run is Tier-A
   compliant on the same benchmark — full or seeded-random sample, the
   benchmark's own judge, its official evaluator. A citation comparison
   against a subset run with a substituted judge is not a comparison.
2. **Run the vendor's own published tool**, as they document it, and report
   both runs' provenance. This is the stronger form and stays outside this
   repo until our internal numbers are trusted.

Nothing here is required for `akm-eval` to produce publishable akm numbers,
which is the actual prerequisite for any cross-tool claim.

## Scope note

`swe-bench` and `terminal-bench` are no longer packs in this repo — coding benchmarks moved to
[`akm-bench`](https://github.com/itlackey/akm-bench), which runs them through Harbor. See
`docs/benchmark-packs.md`. No separate external blocker was found in the current `tau-bench`
adapter code beyond the gaps listed above; it already runs through the official upstream harness
when that harness and credentials are available.
