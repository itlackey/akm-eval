# akm-eval

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

## Host requirements

For normal `bin/...` usage:

- `bash`
- `docker` with a running daemon
- `uv`
- one real model-provider setup:
  - `opencode`: `config/opencode.json` plus required env such as `OPENCODE_API_KEY`
  - or `openai-compatible`: a reachable endpoint plus its required env/config

Extra pack requirements still apply:

- `beam`: local `vendor/BEAM` checkout, prepared official datasets, and judge configuration

`bun` is only required for repo development tasks.

## Reproduce the published results

The numbers in [`docs/metrics-highlights.md`](./docs/metrics-highlights.md) and
[`runs/RESULTS-n200-0.9.10.md`](./runs/RESULTS-n200-0.9.10.md) come from two
commands. Both are reproducible: the sample regenerates from its recorded seed,
the judge is pinned, and the evaluator is the benchmark's own.

**1. Prerequisites**

- `bun`, `docker` (running daemon), `uv`
- Two credentials, which `bin/memory-eval` will load from `akm env` if you keep
  them there, or you can export yourself:

  | variable | what it is |
  | --- | --- |
  | `OPENCODE_API_KEY` | the agent arms' provider (opencode Zen) |
  | `AKM_EVAL_JUDGE_API_KEY` | an OpenAI key that can serve `gpt-4o` — the judge LongMemEval specifies. Zen does not serve any gpt-4 model, so this is a separate credential. |

  Only the judge needs OpenAI. It never sees the conversation haystack, so it is
  roughly 1% of a run's tokens.

**2. Free check first — did retrieval change?**

```bash
bin/build-image        # once per machine
bin/probe 0.9.10       # LLM-free, deterministic, minutes
```

Grades both memory packs against committed reference values and exits nonzero on
a regression. If this fails, stop — there is no point spending judged budget.

**3. The judged run**

```bash
bin/memory-eval longmemeval        # all three arms
bin/memory-eval longmemeval --dry-run   # print the resolved config and stop
```

Writes `runs/longmemeval-full-<stamp>/{baseline,raw-vector,akm-memory}/` with a
`result.json` per arm. Expect roughly 45-60 minutes and ~24M agent tokens at the
committed `n=200` sample.

**What the committed config pins**

| setting | value | why |
| --- | --- | --- |
| sample | 200 / 500, `sampleSeed: 1337` | seeded and reproducible; subsetting without a seed is refused |
| categories | all five | no filter — dropping a hard category inflates the score |
| judge | `gpt-4o` | the model the benchmark specifies |
| evaluator | official, unmodified | no local heuristic scoring |

To run the full 500 instead, remove `maxQuestions` and `sampleSeed` from
`config/common/longmemeval-akm-ab-zen.json`. To change the sample, change the
seed and re-run — never re-roll silently, and report the seed you used.

The rules any published figure has to satisfy are in
[`docs/comparability.md`](./docs/comparability.md). Read it before quoting a
number.

## Quick start

Validating a new akm-cli version? Start here — free, deterministic, no LLM and
no Docker. It installs the version in isolation, probes both packs, and grades
the result against the committed reference values:

```bash
bin/probe 0.9.10        # or: bin/probe (npm latest), bin/probe --cmd '["/path/to/akm"]'
```

It exits nonzero if retrieval regressed, which is the signal to stop before
spending judged-eval budget. Artifacts land in `runs/probes/<version>-<stamp>/`.

For a judged run:

```bash
bin/build-image
bin/doctor --pack locomo
bin/eval --pack locomo --variant baseline --config config/common/locomo-smoke.json
```

Common runnable configs live under `config/common/`; see `docs/running-evals.md` for the current list.

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
- operator caveats and exceptions: [`docs/operator-guide.md`](./docs/operator-guide.md)
- pack constraints: [`docs/benchmark-packs.md`](./docs/benchmark-packs.md)
- remaining external blockers: [`docs/operator-blockers.md`](./docs/operator-blockers.md)
- normalized result contract: [`docs/result-schema.md`](./docs/result-schema.md)
- contributor guide: [`docs/contributing.md`](./docs/contributing.md)
