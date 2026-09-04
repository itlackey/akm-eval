# Staged plan: evolve `akm-eval` into the `akm-evals` monorepo

Status: proposed

Staging branch: `staging/akm-evals-monorepo`

Tracking issue: [#21](https://github.com/itlackey/akm-eval/issues/21)

## Decision summary

Create one operator-facing repository, eventually named `akm-evals`, while
keeping the two benchmark systems as separate packages with enforced trust and
runtime boundaries.

The consolidation is intended to simplify distribution, dependency and version
management, container operation, CI, documentation, and result provenance. It
must not turn Tier A third-party memory benchmarks and Tier B first-party coding
benchmarks into one benchmark or one score.

This is a monorepo and operations decision, not a decision to merge benchmark
engines.

## Current state and motivation

`akm-eval` currently owns Tier A memory and long-term-recall evaluation:

- LongMemEval, LoCoMo, BEAM, and related memory packs
- memory backends, retrieval metrics, answer metrics, normalized results, and
  reporting
- Docker-first operator wrappers landed in PR #20

`akm-bench` currently owns Tier B agent/coding evaluation:

- the first-party AKM task corpus
- Harbor job definitions and the custom AKM/OpenCode Harbor agent
- static utility, attribution, temporal/evolve, calibration, and A/B reporting
- a large versioned fixture/task corpus whose historical comparability must be
  preserved

The split remains scientifically correct, but the repository boundary now
creates avoidable operational duplication:

- users need two clones and two command surfaces;
- runtime and dependency pins can drift independently;
- Docker, API configuration, provenance, reporting, and CI conventions are
  maintained twice;
- `akm-bench` still exposes host Bun/Python/Harbor paths for its Harbor A/B run;
- `akm-bench` currently has different AKM pins in its package/Docker path and
  Harbor path, and its CI selects Bun `latest` even though the repos otherwise
  carry Bun 1.3.13 pins;
- OpenCode, the AKM CLI, the AKM plugin, Harbor, Node, Bun, Python, and formatter
  versions are spread across several files.

The present `akm-eval` project-boundary rule is still load-bearing. The
monorepo must preserve it as a package boundary instead of deleting it.

## Goals

1. One clone and one documented launcher for all AKM evaluations.
2. Git and Docker are the only required host tools for operator workflows.
3. Provider credentials/configuration remain explicit and external to images.
4. Every run records the exact evaluator, dataset, model, AKM, plugin, and
   toolchain identities that produced it.
5. Runtime and experiment pins have authoritative, validated sources.
6. `akm-bench` history, fixtures, calibration rules, and prior results remain
   discoverable and reproducible.
7. Tier A and Tier B remain technically and editorially impossible to conflate.
8. Existing operator commands have compatibility shims through a documented
   transition period.

## Non-goals

- Do not create a combined Tier A/Tier B score, chart, leaderboard, or default
  comparison.
- Do not make either benchmark engine import the other's implementation.
- Do not replace official upstream evaluators with a common local scorer.
- Do not silently change an existing benchmark slice, verifier, prompt, seed,
  model, or scoring rule during the repository move.
- Do not rewrite or discard published run artifacts.
- Do not archive or delete `akm-bench` until parity evidence and link migration
  are complete.
- Do not require users to install Bun, Node, Python, uv, Harbor, OpenCode, jq,
  or AKM on the host.

## Target repository shape

```text
akm-evals/
  bin/
    akm-evals                  # host-side Docker dispatcher
    akm-eval                   # compatibility shim
  config/
    toolchains.env             # image/runtime pins
    pinsets/                   # versioned experiment pinsets
  containers/
    core.Dockerfile
    memory.Dockerfile
    beam.Dockerfile
    agent-bench.Dockerfile
  packages/
    memory-eval/               # current akm-eval engine (Tier A)
    agent-bench/               # imported akm-bench engine/corpus (Tier B)
    result-contract/           # schemas/provenance only
  docs/
    comparability.md
    running-evals.md
    monorepo-migration.md
  package.json
  bun.lock
```

The exact physical move can be staged, but the final ownership rules are:

| Area | Owns | Must not own |
| --- | --- | --- |
| `memory-eval` | memory packs/backends and Tier A metrics | Harbor, coding corpus, Tier B scoring |
| `agent-bench` | Harbor integration, first-party corpus, calibration and Tier B reporting | memory-pack scoring or third-party claims |
| `result-contract` | pure result envelope, provenance, validation, serialization | benchmark execution or a universal score |
| root launcher | Docker selection, safe mounts, env allowlist, compatibility dispatch | scoring logic |

## Boundary and comparability contract

The current boundary checker should become a monorepo dependency-direction
check with these invariants:

1. `memory-eval` and `agent-bench` cannot import one another.
2. Both may depend on `result-contract`, which must remain runtime-light and
   benchmark-neutral.
3. Results must carry an explicit `tier` and `benchmarkFamily`.
4. Retrieval, judged-answer, and task/verifier metrics remain separate fields.
5. A comparison command must reject cross-tier inputs. There is no override for
   producing a combined score.
6. Tier B reports retain the first-party-corpus warning and calibration data.
7. Existing versioned corpus slices remain immutable. New or recalibrated tasks
   use new slice identifiers and a measured transition round.
8. Historical result folders stay readable without rerunning the benchmark.

Shared reporting may render the same provenance envelope or table style, but it
must dispatch to tier-specific metric renderers and language.

## Container-first operator contract

### Host requirements

Operator commands may assume only:

- Git, for obtaining the repository;
- a reachable Docker daemon and Docker CLI;
- an env file and/or provider configuration explicitly supplied by the user.

All other tools live in immutable, fingerprinted images. Contributor workflows
may still document optional host toolchains, but those are not the quick start
or the supported reproducibility path.

### Command surface

The root launcher should dispatch without parsing benchmark configuration on
the host:

```sh
AKM_EVALS_ENV_FILE=../akm-evals.env bin/akm-evals memory probe \
  --akm-version 0.9.14-beta.1

AKM_EVALS_ENV_FILE=../akm-evals.env bin/akm-evals memory run longmemeval \
  --variant akm-memory --akm-version 0.9.14-beta.1

AKM_EVALS_ENV_FILE=../akm-evals.env bin/akm-evals bench ab-run eval \
  --pinset akm-0.9.14-beta.1
```

Compatibility shims should forward old commands and print the new equivalent:

- `bin/akm-eval ...` -> `bin/akm-evals memory ...`
- `bin/akm-bench ...` -> `bin/akm-evals bench ...`
- `bin/ab-run ...` -> `bin/akm-evals bench ab-run ...`

### Images

Use separate targets because their trust, size, and runtime needs differ:

- **core**: common validation, result inspection, comparison, and reporting;
- **memory**: exact selected AKM CLI plus the Tier A runtime;
- **beam**: the optional large BEAM dependency stack;
- **agent-bench controller**: pinned Python, Harbor, Bun, Node, OpenCode,
  Docker client/API support, AKM CLI/plugin pinset tooling, and Tier B analysis.

Harbor task images remain part of the corpus and are not folded into the
controller image.

Image identity must include all relevant Dockerfiles, entrypoints, dependency
locks, runtime pin files, and package sources. Prefer immutable registry digests
for published images and retain deterministic local-build fallback. Never use a
mutable `latest` tag as experimental provenance.

### Mount and ownership rules

- Mount the repository and datasets/fixtures read-only.
- Mount only explicit run, cache, and generated-config paths writable.
- Run controller processes as the invoking UID/GID so artifacts remain
  host-owned.
- Mask host dependency directories such as `node_modules` and virtualenvs.
- External source checkouts are opt-in, resolved to explicit absolute paths,
  and mounted read-only.
- Dry runs must not create result directories or make provider calls.

### Credentials

- Keep env files outside the repository by default.
- Forward an explicit allowlist by variable name, or use a user-supplied
  `--env-file`; never copy env files into images.
- Do not place secret values in image labels, image history, Docker command
  arguments, generated configs, logs, or result provenance.
- The Harbor controller must pass only the credentials required by each task
  container rather than forwarding its whole environment.

### Harbor and the Docker daemon

The agent-bench controller must create Harbor task containers while itself
running in a container. For the initial implementation, support local Docker
using Docker-outside-of-Docker:

- require an explicit `--allow-docker-socket` acknowledgement;
- discover the rootful or rootless socket and its group safely;
- mount the socket only into the agent-bench controller, never memory images;
- mount the checkout/output at the same resolved absolute paths inside the
  controller so sibling containers receive host-resolvable bind paths;
- record Docker client/server versions and controller image identity;
- explain that socket access grants effective control of the Docker host and
  only trusted repository/image code should receive it.

An unconditional `--network host` default should be removed. Network mode must
be explicit and recorded when a local provider actually requires it. Remote
Docker daemons are out of scope for the first migration because local bind-path
semantics do not transfer safely without an upload/volume design.

## Pin and dependency model

Separate toolchain pins from experimental pins:

- `config/toolchains.env` is the single source for image-level Bun, Node,
  Python, jq, Docker-client, and formatter versions.
- versioned files under `config/pinsets/` define experimental AKM CLI,
  `akm-opencode`, OpenCode, Harbor, model, and compatibility constraints.
- a run may select a published AKM version explicitly without changing a
  default pinset; source-checkout runs record the source commit and dirty state.
- generated Harbor configs receive values from the selected pinset. Checked-in
  templates must not repeat literal runtime pins.
- CI scans Dockerfiles, workflows, package manifests, and Harbor templates for
  forbidden mutable/range pins and inconsistent copies.

The migration must remove the present `akm-bench` split where package/Docker
paths resolve AKM 0.7.x while Harbor resolves AKM 0.9.10. AKM CLI and plugin
versions must be validated together before any model call.

## Result and provenance contract

The shared envelope should minimally record:

- schema version, tier, benchmark family, pack/slice, arm, and run identifier;
- evaluator repository commit and dirty state;
- package/controller image digest and runtime fingerprint;
- AKM CLI version or source commit, plus plugin version when applicable;
- Bun, Node, Python, Harbor, OpenCode, Docker client/server, agent model, judge
  model, and provider identities when relevant;
- dataset/corpus identifier, content hash, sample size, source population,
  seed, categories, and task-list hash;
- timestamps, retry counts, token/cost/latency fields, and failure disclosure;
- tier-specific metric namespaces.

Secrets, raw credentials, and machine-specific auth paths are forbidden.

Schema evolution requires fixtures proving that all committed historical result
formats remain loadable. Normalization may add explicit `unknown`/`null` values;
it must not invent measurements that were not captured.

## Migration sequence

### Phase 0: freeze and inventory

- [ ] Tag the exact pre-migration heads in both repositories.
- [ ] Record default branches, open issues/PRs, Actions, release/package links,
      submodules, and ecosystem references.
- [ ] Capture passing checks and representative dry-run output in both repos.
- [ ] Select one deterministic smoke and one historical result fixture per
      engine for parity testing.
- [ ] Write the dependency/pin inventory and classify each pin as toolchain or
      experiment provenance.

Exit: both repositories can be reconstructed and compared after any migration
step.

### Phase 1: establish root contracts

- [ ] Add the workspace root, root launcher skeleton, toolchain pin source, and
      neutral result-contract package.
- [ ] Convert the existing boundary test into package dependency-direction and
      cross-tier comparison tests.
- [ ] Add namespaced output paths (`runs/memory/`, `runs/agent-bench/`) without
      moving historical results.
- [ ] Keep every existing `akm-eval` command working through shims.

Exit: no benchmark behavior changes, and current memory checks still pass.

### Phase 2: place the memory engine

- [ ] Move current memory implementation into `packages/memory-eval` with
      history-followable moves.
- [ ] Update Docker fingerprints/build contexts and all path-sensitive tests.
- [ ] Prove the 0.9.13/0.9.14-beta.1 retrieval probe fixtures grade identically
      before and after the move.
- [ ] Prove a judged-run dry-run renders the same arms, dataset sample, models,
      and output metadata.

Exit: the Docker-first behavior from PR #20 is unchanged through the root
launcher.

### Phase 3: import `akm-bench` with history

- [ ] Import the repository into `packages/agent-bench` using an auditable
      history-preserving subtree or a temporary `git filter-repo` import.
- [ ] Record old-to-new commit/path mapping and the source head/tag.
- [ ] Preserve task, slice, calibration, and historical result paths beneath
      the package; do not rewrite their contents as cleanup.
- [ ] Reconcile the identical MPL-2.0 license and retain attribution/history.
- [ ] Cross-link or recreate still-open `akm-bench` issues before cutover.

Exit: `git log` can trace imported files to the source history and every
committed historical report remains readable.

### Phase 4: make agent-bench container-first

- [ ] Build the pinned agent-bench controller target with Harbor and analysis
      dependencies preinstalled.
- [ ] Move `bin/ab-run` host Python/Bun/Harbor work into that controller.
- [ ] Implement the explicit Docker-socket acknowledgement and rootful/rootless
      socket tests.
- [ ] Implement same-absolute-path mounts for Harbor sibling containers.
- [ ] Apply the read-only checkout, writable-output, invoking-UID, dependency
      masking, env allowlist, env-file, image fingerprint, and dry-run rules.
- [ ] Make AKM version/plugin/OpenCode pinsets selectable and fail closed on an
      incompatible plugin gate before any paid call.
- [ ] Remove implicit host networking; add explicit recorded provider-network
      configuration.

Exit: a clean machine with only Git and Docker can perform agent-bench doctor,
config render, contract checks, dry-run, and a deterministic no-cost smoke.

### Phase 5: unify CI and maintenance surfaces

- [ ] Replace Bun `latest` with the authoritative pin.
- [ ] Use path-filtered jobs for memory, agent-bench TypeScript, Harbor Python,
      boundary/schema, and container-wrapper checks.
- [ ] Add local-build tests for each image target and manual/nightly heavy BEAM
      and Harbor integration workflows.
- [ ] Validate fully resolved dependency locks and detect duplicated pin
      literals.
- [ ] Publish immutable image tags/digests and provenance/SBOM metadata, with a
      local-build fallback.
- [ ] Add one root contributing guide and one operator env example.

Exit: one dependency update PR can update a pin, its image fingerprint, tests,
and both packages without silent drift.

### Phase 6: parity and cutover

- [ ] Run old and monorepo deterministic smoke fixtures and compare normalized
      artifacts.
- [ ] Run one explicitly budgeted live Tier A canary and one Tier B canary on
      unchanged configs; document stochastic tolerance and all pin deltas.
- [ ] Verify compatibility shims and old result loaders.
- [ ] Update links in `akm`, `akm-stash`, `akm-registry`, and `akm-plugins`.
- [ ] Rename `akm-eval` to `akm-evals` only after commands, paths, and links are
      ready; verify redirects and Actions after the rename.
- [ ] Change `akm-bench` to a read-only migration notice and archive it only
      after its issues and references have successors.

Exit: new users need one clone, while existing users and historical links have
a documented transition path.

## Acceptance criteria

The migration is complete only when all of the following are true:

- [ ] On a clean host with Git and Docker, `bin/akm-evals doctor`, memory probe
      dry-run, judged-memory dry-run, agent-bench dry-run, and no-cost smoke run
      without host language/tool installations.
- [ ] Memory containers cannot access the Docker socket; agent-bench cannot
      access it without explicit acknowledgement.
- [ ] Repository and fixture mounts are read-only, and run artifacts are owned
      by the invoking user.
- [ ] Secrets are absent from image history/config, Docker argv, generated
      configs, logs, and results.
- [ ] Every mutable runtime and experimental dependency is exact, centrally
      discoverable, and recorded in output provenance.
- [ ] Image fingerprints change whenever a relevant source, lock, pin,
      Dockerfile, or entrypoint changes.
- [ ] Tier A/Tier B imports and comparisons fail in automated boundary tests.
- [ ] Existing memory tests, Harbor contract tests, agent-bench tests, analysis
      tests, linters, type checks, and shell checks pass from the workspace root.
- [ ] Historical results and corpus slices remain loadable and semantically
      unchanged.
- [ ] Deterministic before/after parity fixtures match; paid canary differences
      are disclosed rather than attributed to the move.
- [ ] Old commands produce a useful deprecation message and the same behavior
      during the compatibility window.
- [ ] Operator documentation has one copy-paste path for memory and one for
      agent-bench, both starting with an external env file.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Tier A and Tier B claims become visually conflated | explicit tier schema, separate metric renderers, hard cross-tier comparison failure |
| Harbor controller socket can control the Docker host | agent-bench-only mount, explicit acknowledgement, strong warning, trusted immutable image, no socket in memory paths |
| Controller paths do not resolve in sibling task containers | same absolute host/container paths and integration tests using spaces and non-default output roots |
| Import loses history or issue context | pre-migration tags, history-preserving import, mapping record, issue cross-links before archive |
| Mechanical path move changes benchmark behavior | deterministic fixtures, config snapshots, artifact parity, no simultaneous scorer/corpus edits |
| Central pin cleanup accidentally changes multiple experiment variables | toolchain/experiment separation, versioned pinsets, one-variable transition rounds |
| Monorepo makes every change run every expensive check | path-filtered CI plus required boundary/schema checks |
| Repository becomes large because of task/result history | keep generated jobs/caches ignored; measure clone/build contexts; move large external datasets to verified downloads rather than Git |
| Root launcher leaks credentials to nested task containers | strict per-command/per-task allowlists and tests with sentinel credentials |

## Rollback strategy

Every phase should merge independently and preserve the old entry points until
cutover. Before the final rename/archive, rollback is a normal revert of the
latest phase. After cutover, the pre-migration tags and unarchived source repo
remain the recovery points until one successful maintenance cycle and both live
canaries have completed.

Do not combine the repository rename, source-repo archival, container runtime
rewrite, corpus changes, and result-schema migration in one irreversible step.

## Decisions required during implementation

1. Whether published images live in GHCR immediately or begin as deterministic
   local builds.
2. The compatibility-window length for old command names.
3. Whether `result-contract` is a private workspace package or generated schema
   files consumed independently by both engines.
4. The initial supported Docker environments: Linux rootful and rootless are
   required; Docker Desktop support should be tested before being promised.
5. Whether historical generated results remain inside the imported package or
   move later to a separate artifact/data repository. They must not be moved as
   part of the engine import itself.
