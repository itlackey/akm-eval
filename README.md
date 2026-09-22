# akm-eval

[![PR CI](https://github.com/itlackey/akm-eval/actions/workflows/ci-pr.yml/badge.svg)](https://github.com/itlackey/akm-eval/actions/workflows/ci-pr.yml)
[![Scheduled smoke](https://github.com/itlackey/akm-eval/actions/workflows/smoke-schedule.yml/badge.svg)](https://github.com/itlackey/akm-eval/actions/workflows/smoke-schedule.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](./LICENSE)

AKM Eval runs real memory / long-term-recall benchmark packs through authoritative upstream
harnesses and dataset evaluators, and normalizes the outputs.

This repo's scope is memory benchmarks only. Standard agentic-coding benchmarks (SWE-bench,
Terminal-Bench, and akm's own task corpus) live in
[`akm-bench`](https://github.com/itlackey/akm-bench), which runs them through the Harbor
benchmark-execution harness instead of duplicating a container/agent runtime here. See
`docs/benchmark-packs.md` for the split rationale.

Part of the [akm](https://github.com/itlackey/akm) ecosystem — see also
[akm-stash](https://github.com/itlackey/akm-stash),
[akm-plugins](https://github.com/itlackey/akm-plugins),
[akm-registry](https://github.com/itlackey/akm-registry), and
[akm-bench](https://github.com/itlackey/akm-bench).

Trust policy:

- no synthetic or heuristic success metrics
- no silent fallback when an official harness or evaluator is unavailable
- baseline and future AKM variants both use real model providers

**Every number here is meant to stand next to the same benchmark's published
numbers from other tools, so nothing in a benchmark, its dataset, or its
evaluator may be modified in a way that could move a score.** The rules that
follow from that — full-or-seeded sampling, the judge as part of the
benchmark, one variable per round, equal effort for competitor arms, and the
hard separation from first-party corpus results — are in
[`docs/comparability.md`](./docs/comparability.md), along with the violations
that currently block publication. Read it before publishing a figure or
changing a pack.

## Start here

Clone the repo, then verify the published evidence and probe the current AKM
release. Both commands are deterministic and make **no model or API calls**:

```bash
git clone https://github.com/itlackey/akm-eval.git
cd akm-eval
bin/reference-eval verify
bin/probe --akm-version 0.9.16
```

The first invocation builds a pinned Docker image when one is not already
cached, which can take a few minutes. Later commands reuse the dependency
layers and versioned images. The probe writes an ignored artifact under
`runs/probes/`; the evidence verifier does not need credentials, a dataset
download, or a running model.

To run a small three-arm LoCoMo evaluation of your own:

```bash
bin/downloads LoCoMo
cp .env.example ../akm-eval.env
# Edit ../akm-eval.env and set OPENAI_API_KEY.
export AKM_EVAL_ENV_FILE="$(cd .. && pwd)/akm-eval.env"

# Validate routing, credentials, config, and the selected AKM version first.
bin/memory-eval locomo --akm-version 0.9.16 \
  --config config/common/locomo-akm-ab.json \
  --out runs/locomo-0.9.16-smoke --dry-run

# Remove --dry-run when the preview is correct.
bin/memory-eval locomo --akm-version 0.9.16 \
  --config config/common/locomo-akm-ab.json \
  --out runs/locomo-0.9.16-smoke
```

That smoke config evaluates five questions in each of the full-context,
raw-vector, and AKM arms. It makes real answer-model requests and is useful for
checking a setup, but a five-question smoke result is not a publishable
benchmark score. Copy a committed config before changing its provider, model,
sampling, or evaluator settings; the run artifacts record those choices.

| Command | External model use | Purpose |
| --- | --- | --- |
| `bin/reference-eval verify` | None | Reconstruct and checksum published evidence |
| `bin/probe --akm-version VERSION` | None | Deterministic retrieval regression check |
| `bin/memory-eval ... --dry-run` | None | Preview exact arms, routing, target, and output |
| LoCoMo three-arm smoke above | 15 answer generations, plus retries if needed | Validate an end-to-end setup |
| `bin/reference-eval run-akm ...` | 500 local answers and 500 GPT-4o verdicts, plus retries | Produce a reference-compatible AKM result |

See [`docs/running-evals.md`](./docs/running-evals.md) for custom providers and
[`docs/reference-results.md`](./docs/reference-results.md) before spending a
full reference-run budget.

## Host requirements

For normal `bin/...` usage, the host only needs:

- `bash`
- `git` (to clone the evaluator and to record provenance)
- `docker` with a running daemon

The images contain the pinned Bun, Node, Python, jq, and evaluator libraries;
version-selected images also contain that exact `akm-cli`. The checkout is
mounted read-only for configs, datasets, source, and git provenance; only
result paths are writable, and `bin/downloads` temporarily makes `datasets/`
writable. Its `node_modules` is masked so host packages cannot shadow the image
lockfile. No host Bun, Node, npm, Python, uv, or jq is used.

Provide a real model endpoint through exported variables, or keep them in a
Docker env file outside the repo:

```bash
cp .env.example ../akm-eval.env  # fill this file; keep it outside the checkout
AKM_EVAL_ENV_FILE=/absolute/path/to/eval.env \
  bin/memory-eval longmemeval --akm-version 0.9.16 --dry-run
```

The wrapper forwards only documented provider variables (by name, so values do
not appear in Docker argv). Add unusual provider variables explicitly with
`AKM_EVAL_ENV_ALLOWLIST=NAME,OTHER_NAME`. Local provider files and secrets are
never copied into the image. See [`docs/running-evals.md`](./docs/running-evals.md)
for external dataset and source mounts.

Extra pack requirements still apply:

- `beam`: local `vendor/BEAM` checkout, prepared official datasets, and judge configuration

`bun` is only required for repo development tasks.

## Official results ledger

[`results/official-results.json`](./results/official-results.json) is the
canonical, tracked, append-only ledger for completed benchmark scores and
statistics. Each round records the full protocol identity, resolved model
census, scores, token usage, timing, category and retrieval metrics, comparison
deltas, and checksums for the underlying run artifacts. Its contract is
published in
[`config/schemas/official-results.schema.json`](./config/schemas/official-results.schema.json)
and checked in CI.

Narrative reports under `runs/` and `docs/metrics-highlights.md` remain useful
historical analysis, but new official numbers must be recorded in the ledger.
Corrections append a superseding or retracted record instead of silently
rewriting an earlier result.

The full per-question evidence and checksum manifest for each reusable round
are tracked under [`results/reference/`](./results/reference/). Run
`bin/reference-eval verify` to reconstruct and verify the published numbers
without credentials or model calls.

Current full-500 small-model reference (Qwen 3.5 9B Q4_K_M answers, official
GPT-4o judge):

| Arm | Score | Correct | Answer-model tokens | Wall time |
| --- | ---: | ---: | ---: | ---: |
| Full-context baseline | 39.2% | 196/500 | 53,839,306 | ~11h 10m |
| Raw vector | 28.6% | 143/500 | 5,493,818 | 56m 5s |
| AKM 0.9.15 candidate (`lead`, 3200 chars) | 36.2% | 181/500 | 1,731,027 | 1h 14m 22s |
| AKM 0.9.15 published package (`lead`, 3200 chars) | 36.4% | 182/500 | 1,731,030 | ~1h 33m 32s |
| AKM 0.9.16-alpha.1 published package (`lead`, 3200 chars) | 39.6% | 198/500 | 4,239,238 | ~1h 42m 1s |
| AKM 0.9.16 published package (`lead`, 3200 chars) | 35.4% | 177/500 | 1,731,173 | 1h 10m 43s |

The published 0.9.16-alpha.1 package is +11.0 percentage points over raw vector
and +0.4 points over full context. It is +3.2 points and 16 answers over the
published 0.9.15 package, with 2,508,208 more answer-model tokens. Judge token
usage is not included because the upstream evaluator does not report it.

The 0.9.16 indexer reversion restores the 0.9.15 retrieval surface exactly:
all 500 retrieval provenance lists, contexts, and input-token counts match.
Its 35.4% score is 4.2 points below alpha.1 and 1.0 point below 0.9.15. The
0.9.16 run used 2,508,065 fewer tokens than alpha.1; see its evidence bundle
for the generation/runtime and judge-variance audit.

The paid artifact reported `0.9.16-alpha.2`. The final `0.9.16` source diff
changes only version/changelog metadata and byte-preserving piped-stdout
transport, not any score-affecting path used here. The ledger therefore adopts
the completed score for the final release while retaining the exact evaluated
artifact and release-equivalence audit in the evidence bundle.

The frozen controls and original source-candidate arm are Tier A. The two
0.9.15 and alpha.1 package follow-ups are Tier B because their interrupted
runs resumed through an operator-approved mixed CUDA/Intel pool. 0.9.16 is
also Tier B: all 500 answers came from the existing direct Intel/SYCL service,
whose newer llama.cpp runtime and repeat penalty differ from Tier A. No service
was reconfigured for 0.9.16. Tier B wall times are not controlled hardware
comparisons.

## Reproduce the published results

The current official reference is a full 500-question, three-arm LongMemEval
round using a checksum-pinned local Qwen 3.5 9B model and the official GPT-4o
judge. Verify its complete tracked evidence without an API call:

```bash
bin/reference-eval verify
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.15
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16-alpha.1
bin/reference-eval verify \
  --round longmemeval-qwen35-9b-q4km-131k-v1-akm-0.9.16
```

For a normal AKM release, reuse the verified baseline and raw-vector controls
and run only the AKM arm:

```bash
bin/downloads LongMemEval
bin/reference-model fetch
bin/reference-model up
export AKM_EVAL_JUDGE_API_KEY=...
bin/reference-eval run-akm --akm-version 0.9.16 \
  --out runs/qwen-reference-akm-0.9.16
```

Control reruns are available but deliberately require an explicit confirmation
flag. The exact model source, two-GPU Docker topology, reuse compatibility
contract, resume behavior, AKM-only workflow, control/all-arm commands, and
publication checklist are in
[`docs/reference-results.md`](./docs/reference-results.md).

## Retrieval regression probe

Validating a new akm-cli version? Start here — free and deterministic, with no
LLM or host toolchain. It builds/selects a version-specific Docker image,
probes both packs, and grades the result against committed reference values:

```bash
bin/probe --akm-version 0.9.16
```

For an unpublished checkout, the equivalent path builds locked dependencies
and AKM itself inside Docker while leaving the host checkout read-only:

```bash
bin/probe --akm-source ../akm
bin/memory-eval longmemeval --akm-source ../akm \
  --config config/common/longmemeval-akm-fragment-context-0915.json
```

The result records the source Git SHA, full tree fingerprint/dirty state,
provider-resolved model census, and per-question context provenance.

The historical comparison is informational because
its LoCoMo reference is stale; artifacts land in `runs/probes/<version>-<stamp>/`.
For release approval, run a `0.9.13` control and an identity-permutation source
candidate, then use `bin/probe-pair --control <dir> --candidate <dir>`. It
compares the two matching artifacts and writes a verdict even when it fails.

For a single scored smoke run:

```bash
bin/build-image --akm-version 0.9.16
AKM_EVAL_AKM_VERSION=0.9.16 \
  bin/doctor --pack locomo
AKM_EVAL_AKM_VERSION=0.9.16 \
  bin/eval --pack locomo --variant baseline --config config/common/locomo-smoke.json
```

Common runnable configs live under `config/common/`; see `docs/running-evals.md` for the current list.

The immutable full-500 reference reproduction config lives under
`config/reference/` and should be invoked through `bin/reference-eval`, which
adds compatibility checks and expensive-control guards.

- `config/common/locomo-smoke.json`
- `config/common/longmemeval-smoke.json`
- `config/common/beam-smoke.json`
- `config/common/tau-bench-smoke.json`
- `config/common/locomo-akm-ab.json` — baseline / raw-vector / akm three-arm comparison (see `docs/memory-backends.md`)
- `config/common/longmemeval-akm-ab.json` — same three-arm shape for longmemeval: the two retrieval arms
  (`raw-vector`, `akm-memory`) route through `memory.add()`/`memory.search()` per question, while `baseline`
  keeps the full-haystack prompt. See the config's own `notes` and `docs/memory-backends.md` before spending
  judge budget on this one.

## Supported packs

- `locomo`
- `longmemeval`
- `beam`
- `tau-bench`

Coding benchmarks (`swe-bench`, `terminal-bench`, and akm's own task corpus) are not part of this
repo. Run those through [`akm-bench`](https://github.com/itlackey/akm-bench), which executes them
via Harbor instead of a bespoke container/agent runtime.

## Runner support

| Pack | `opencode` | `openai-compatible` |
|---|---|---|
| `locomo` | Yes | Yes |
| `longmemeval` | Partial | Yes |
| `beam` | Yes | Yes |
| `tau-bench` | No | Yes |

## Docs

- command flow: [`docs/running-evals.md`](./docs/running-evals.md)
- official results and reproduction: [`docs/reference-results.md`](./docs/reference-results.md)
- operator caveats and exceptions: [`docs/operator-guide.md`](./docs/operator-guide.md)
- pack constraints: [`docs/benchmark-packs.md`](./docs/benchmark-packs.md)
- remaining external blockers: [`docs/operator-blockers.md`](./docs/operator-blockers.md)
- normalized result contract: [`docs/result-schema.md`](./docs/result-schema.md)
- contributor guide: [`docs/contributing.md`](./docs/contributing.md)
