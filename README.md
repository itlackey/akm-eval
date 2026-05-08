# akm-eval

AKM Eval runs real benchmark packs through authoritative upstream harnesses and normalizes the outputs.

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
- `terminal-bench`: `opencode` provider path only

`bun` is only required for repo development tasks such as tests and boundary checks.

## Quick start

```bash
bin/build-image
bin/doctor --pack locomo
bin/eval --pack locomo --variant baseline --config config/common/locomo-smoke.json
```

Common runnable configs live under `config/common/`:

- `config/common/locomo-smoke.json`
- `config/common/longmemeval-smoke.json`
- `config/common/beam-smoke.json`
- `config/common/swe-bench-smoke.json`
- `config/common/swe-bench-smoke-openai-compatible.json`
- `config/common/tau-bench-smoke.json`
- `config/common/terminal-bench-smoke.json`

## Supported packs

- `locomo`
- `longmemeval`
- `beam`
- `swe-bench`
- `terminal-bench`
- `tau-bench`
- `akm-bench` remains intentionally blocked

## Runner support

| Pack | `opencode` | `openai-compatible` |
|---|---|---|
| `locomo` | Yes | Yes |
| `longmemeval` | Partial | Yes |
| `beam` | Yes | Yes |
| `swe-bench` | Yes | Yes |
| `tau-bench` | No | Yes |
| `terminal-bench` | Yes | No |
| `akm-bench` | No | No |

## Docs

- command flow: [`docs/running-evals.md`](./docs/running-evals.md)
- operator caveats and exceptions: [`docs/operator-guide.md`](./docs/operator-guide.md)
- pack constraints: [`docs/benchmark-packs.md`](./docs/benchmark-packs.md)
- remaining external blockers: [`docs/operator-blockers.md`](./docs/operator-blockers.md)
- normalized result contract: [`docs/result-schema.md`](./docs/result-schema.md)
- contributor guide: [`docs/contributing.md`](./docs/contributing.md)
