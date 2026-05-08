# Operator blockers

This checklist covers the remaining items that cannot be completed by more repo-only coding alone. Each item needs operator action, upstream maintainer action, or an external system that this repository does not control.

Start from a committed example config plus direct wrapper commands such as `bin/doctor` and `bin/eval ...`. If you still need a guided starter config, `bun run setup:legacy` remains available, but it does not clear the blockers below on its own.

## 1. BEAM upstream checkout and prepared datasets are still external prerequisites

Why the repo cannot finish it alone:
`beam` hard-requires the upstream `mohammadtavakoli78/BEAM` checkout plus prepared official dataset directories. This repo intentionally does not vendor the upstream repo or datasets, and `src/packs/beam/official.ts` fails when they are absent.

Concrete completion steps a human must perform:
1. Use a committed example config directly, or run `bun run setup:legacy` if you still want a guided starter config.
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
4. If a non-default judge model is required, set `pack.config.evaluatorModel` in the BEAM run config.

What evidence or artifacts should be captured when done:
- The judge endpoint class used: `openai` or `openai-compatible`.
- The evaluator model name used for the run.
- The runtime fingerprint showing `beamJudgeBaseUrl` and `beamJudgeProvider`.
- Run logs showing the upstream evaluator completed.

How to verify completion in this repo afterward:
Run `bin/doctor --pack beam` and confirm it no longer fails on judge configuration. Then run a BEAM smoke config and confirm `raw-output.json` and `result.json.metadata` include `beamJudgeBaseUrl`, `beamJudgeProvider`, and `beamRuntimeFingerprint`.

Sources:
`docs/beam-runtime.md`, `src/packs/beam/official.ts`, `src/packs/beam/adapter.ts`

## 3. AKM memory-backend integration is blocked on an upstream add/search contract

Why the repo cannot finish it alone:
`src/memory/backends/akm.ts` can verify `akm --help` and `akm info --format json`, but it still fails intentionally because `akm memory --help` does not expose a documented indexing and query contract that truthfully maps onto this repo's `MemoryBackend.add()` and `MemoryBackend.search()` interface.

Concrete completion steps a human must perform:
1. Coordinate with AKM maintainers to provide a stable, documented memory ingestion and retrieval interface.
2. Ensure the interface defines how documents are added, how queries are issued, what identifiers and scores are returned, and what persistence or namespace boundaries are supported.
3. Pin the AKM version that exposes that contract and record the operator setup procedure.
4. Capture the command or API examples that prove round-trip add and search behavior.

What evidence or artifacts should be captured when done:
- The AKM version string from `akm info --format json`.
- The CLI or API documentation that describes the supported add and search contract.
- Example request and response transcripts showing one successful add and one successful search.
- Any upstream issue, PR, or release note that establishes the contract as supported rather than incidental.

How to verify completion in this repo afterward:
At minimum, rerun `akm --help`, `akm info --format json`, and `akm memory --help` and confirm the latter now documents a concrete add/search surface. Full repo verification will only pass after the corresponding repo integration lands, but this prerequisite is cleared once the contract is externally documented and reproducible.

Sources:
`README.md`, `docs/memory-backends.md`, `docs/running-evals.md`, `src/memory/backends/akm.ts`, `src/memory/registry.ts`

## 4. `akm-bench` still lacks an authoritative external process and artifact boundary

Why the repo cannot finish it alone:
`src/packs/akm-bench/adapter.ts` is intentionally hard-blocked. The previous local proxy-scoring path was removed, and the pack cannot be truthfully re-enabled until a real external `akm-bench` process and its authoritative result artifacts exist.

Concrete completion steps a human must perform:
1. Define or adopt the authoritative external `akm-bench` execution path.
2. Specify exactly which output artifact from that external process is the source of truth.
3. Freeze the invocation contract, output schema, and provenance expectations so this repo can normalize them without inventing scores.
4. Provide one example artifact set produced by the external process.

What evidence or artifacts should be captured when done:
- The external command or service contract for running `akm-bench`.
- A sample authoritative artifact bundle from that process.
- A schema or field reference for the artifact fields that define success and score.
- Provenance details showing the benchmark version and model/runtime used.

How to verify completion in this repo afterward:
Once the external process exists, repo verification should be a real ingest path that produces a normalized `result.json` from only the authoritative artifacts. Until then, `bin/doctor` and `bin/eval --pack akm-bench ...` should continue to report the pack as blocked.

Sources:
`README.md`, `docs/benchmark-packs.md`, `src/packs/akm-bench/README.md`, `src/packs/akm-bench/adapter.ts`

## 5. `mem0`, `openviking`, and `zep` still need operator-selected real backend contracts and provisioned runtimes

Why the repo cannot finish it alone:
These backend IDs are only planned placeholders. The repository has no authoritative service endpoint, CLI contract, credential flow, or reproducible runtime for any of them, so it fails before benchmark execution instead of pretending they are evaluated backends.

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
The external prerequisite is satisfied once each chosen backend has a stable, operator-repeatable contract and runtime. Full repo verification will only pass after those integrations are wired, but today you can confirm the current blocked state with `bin/doctor` or `bin/matrix --config <config-path>`, which should stop reporting them as blocked only after both the external prerequisite and repo integration are complete.

Sources:
`docs/memory-backends.md`, `src/memory/registry.ts`, `src/memory/backends/mem0.ts`, `src/memory/backends/openviking.ts`, `src/memory/backends/zep.ts`, `src/variants/registry.ts`

## Scope note

No separate external blocker was found in the current `swe-bench` or `tau-bench` adapter code beyond the reference-artifact provenance gap above. Their adapters already run through official upstream harnesses when those harnesses and credentials are available.
