# Operator guide

## Goal

Run benchmark packs locally or in CI using only authoritative upstream harnesses and reproducible normalized outputs.

## Core commands

```bash
bun install
bin/build-image
bin/downloads
bin/doctor
bin/eval --pack locomo --variant baseline --config config/examples/locomo-smoke.json
bun test
bun run check:boundary
```

Preferred operator script surface:

- `bin/build-image`
- `bin/doctor`
- `bin/eval --pack <pack> --variant <variant> --config <config-path> --out <output-dir>`
- `bin/matrix --config <config-path>`
- `bin/report --run <run-dir>`
- `bin/summary --runs <runs-dir> --format markdown`
- `bin/compare --baseline <run-dir> --candidate <run-dir>`
- `bin/downloads [DatasetName]`
- `bin/beam-doctor`
- `bin/setup`
- `bun run setup:legacy`

## Wrapper-first default

```bash
bin/doctor
bin/matrix --config config/examples/locomo-smoke.json
bin/eval --pack locomo --variant baseline --config config/examples/locomo-smoke.json
```

Default operator flow is:

- choose the closest committed example config
- run `bin/doctor` to confirm containerized runtime status
- run `bin/matrix` when you want to inspect the planned runs from that config
- run the selected pack directly through `bin/eval`

## Legacy setup helper

```bash
bun run setup:legacy
```

The legacy setup command asks for the minimum decisions needed to get started:

- which pack(s) to include in a starter config
- whether those packs should use `openai-compatible` or `opencode` where this repo supports both
- the basic global provider connection fields and default models needed by the selected packs
- the current detected runtime status for the selected packs using the same checks as `bin/doctor`
- whether to download repo-managed datasets now; answering no skips downloads and only writes the config
- whether to run the deeper read-only BEAM preflight when `beam` is selected; answering no skips that check
- where to write the starter config file

It writes a direct `version: 1` run config with only the selected baseline runs and `memoryBackend: none`, using top-level `providers` for global connections plus per-run `agentProvider` references and optional `agentModel` overrides. Blank API keys are allowed for local no-auth `openai-compatible` endpoints. Pack-specific runtime blockers remain explicit in the generated flow output rather than being treated as solved.

The remaining tasks that still require human or external intervention are tracked in [`docs/operator-blockers.md`](./operator-blockers.md).

## Run a single pack

```bash
bin/eval --pack <pack> --variant <variant> --config <config-path> --out <output-dir>
```

Examples:

```bash
bin/eval --pack locomo --variant baseline --config config/examples/locomo-smoke.json --out runs/reference/locomo/baseline
bin/eval --pack longmemeval --variant baseline --config config/examples/longmemeval-smoke.json --out runs/reference/longmemeval/baseline
bin/eval --pack tau-bench --variant baseline --config config/examples/tau-bench-smoke.json --out runs/reference/tau-bench/baseline
```

## Summaries and comparisons

```bash
bin/report --run runs/reference/locomo/baseline
bin/summary --runs runs/reference --format markdown
```

`compare` works on any two normalized runs, but operator-facing docs should not imply committed AKM reference artifacts exist today. `src/memory/backends/akm.ts` is still a stub, so repo-level baseline-vs-AKM comparison claims remain blocked.

## CI

- PR CI: `.github/workflows/ci-pr.yml`
- Weekly smoke: `.github/workflows/smoke-schedule.yml`

## Reference runs

Committed reference artifacts live under `runs/reference/`.

Each reference run should be produced by running directly into its final destination so `result.json` artifact paths match committed files.

New runs now auto-capture `repoCommit` and `runnerType` in `result.json.metadata` when the local git checkout and provider config make those values available. Keep storing pack-specific fields like `benchmarkId` and `benchmarkVersion` truthfully, let unknown values remain unset, and for older committed references prefer an explicit provenance note over reconstructing `repoCommit` from surrounding commits.
