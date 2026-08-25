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

## 3. The `akm` memory backend needs the real akm CLI reachable to actually run

Why the repo cannot finish it alone:
`src/memory/backends/akm.ts` is now a real, evaluated integration — every operation shells out to a
real akm CLI process (`akm remember`/`akm search`/`akm bundle create`/`akm index --full`), with a
deterministic frontmatter-synthesis step, per-instance hermetic install, and fail-loud
ingestion-count verification. See `docs/memory-backends.md` for the full contract, and
`tests/memory-backend-akm.test.ts` / `tests/memory-backend-akm.integration.test.ts` for its test
coverage (the latter a real, no-mocking round trip against a live akm CLI). This was previously
written as a repo-internal implementation gap; that gap is closed.

What remains is an ordinary external-dependency prerequisite, the same shape as BEAM's upstream
checkout in item 1: an operator must make a real akm CLI satisfying `^0.9` reachable before an
`akm`-backed run (not `doctor`, which reports the gap as a `warn` rather than crashing).

**Docker-wrapper caveat:** `bin/doctor`/`bin/eval` (the documented operator entrypoints) route
through `bin/_akm_eval_cli_image.sh` into the built `docker/akm-eval.Dockerfile` image, which
bundles neither the akm CLI nor a mount of any host akm source checkout. `AKM_EVAL_AKM_CMD` is now
forwarded into that container (previously it was silently dropped — not on the wrapper's env
allowlist), but the value still has to resolve to something reachable *inside* the container: an
`akm` binary installed into a custom-built image, or a source-checkout path that lives under the
mounted workspace directory (`AKM_EVAL_WORKSPACE_DIR`, default the repo root). Running `bun
src/cli.ts` directly (outside the Docker wrapper) sidesteps this entirely and is how this repo's own
`tests/memory-backend-akm.integration.test.ts` exercises a real akm CLI.

Concrete completion steps a human must perform:
1. Install akm-cli `^0.9` so `akm` resolves on `PATH`, **or** point `AKM_EVAL_AKM_CMD` at an
   alternate invocation, e.g. `export AKM_EVAL_AKM_CMD='["bun","/path/to/akm/src/cli.ts"]'` for a
   source checkout.
2. If running through the Docker wrapper (`bin/doctor`/`bin/eval`), make sure that invocation is
   actually reachable inside the container per the caveat above — otherwise run `bun src/cli.ts`
   directly instead.
3. Confirm reachability with `bin/doctor` (or `akm-eval doctor`) and check the `memory:akm` line.

What evidence or artifacts should be captured when done:
- The `memory:akm` doctor line reporting `status: ok` and the resolved akm version.
- A completed run's `metadata` in its `result.json`, which records `memoryBackend: "akm"`.

How to verify completion in this repo afterward:
Run `bin/doctor` and confirm `memory:akm` is `OK` (not `WARN`); run
`akm-eval run --pack <pack> --variant akm-memory --config config/common/locomo-akm-ab.json` (or the
`longmemeval-akm-ab.json` equivalent) and confirm it does not fail with an akm-unreachable error.

Sources:
`docs/memory-backends.md`, `src/memory/backends/akm.ts`, `src/memory/registry.ts`,
`config/common/locomo-akm-ab.json`, `config/common/longmemeval-akm-ab.json`

## 4. `mem0`, `openviking`, and `zep` still need operator-selected real backend contracts and provisioned runtimes

Why the repo cannot finish it alone:
These backend IDs are planned placeholders. The repository has no authoritative service endpoint, CLI contract, credential flow, or reproducible runtime for them.

Concrete completion steps a human must perform:
1. For each backend, decide the exact product or deployment that will be treated as the benchmark target.
2. Provision a real runtime for that target and document how operators authenticate to it.
3. Freeze the supported ingestion and search contract for each backend.
4. Record any namespace, persistence, and reset semantics needed to run benchmarks repeatably.
5. Capture one backend-specific add and search transcript for each chosen runtime.

What evidence or artifacts should be captured when done:
- Backend endpoint or CLI details for each selected runtime.
- Version and deployment identifiers for each backend.
- Example add and search transcripts with returned IDs and scores.
- Operator setup notes covering credentials, namespaces, and reset behavior.

How to verify completion in this repo afterward:
Confirm each chosen backend has a stable, operator-repeatable contract and runtime, then rerun `bin/doctor` or `bin/matrix --config <config-path>` to verify the blocked state clears only after the integration lands.

Sources:
`docs/memory-backends.md`, `src/memory/registry.ts`, `src/memory/backends/mem0.ts`, `src/memory/backends/openviking.ts`, `src/memory/backends/zep.ts`, `src/variants/registry.ts`

## Scope note

`swe-bench` and `terminal-bench` are no longer packs in this repo — coding benchmarks moved to
[`akm-bench`](https://github.com/itlackey/akm-bench), which runs them through Harbor. See
`docs/benchmark-packs.md`. No separate external blocker was found in the current `tau-bench`
adapter code beyond the gaps listed above; it already runs through the official upstream harness
when that harness and credentials are available.
