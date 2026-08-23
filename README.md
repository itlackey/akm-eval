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

## Quick start

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
