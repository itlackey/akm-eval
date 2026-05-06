# Operator guide

## Goal

Run benchmark packs locally or in CI using only authoritative upstream harnesses and reproducible normalized outputs.

## Core commands

```bash
bun install
bun run setup
bun run downloads
bun run doctor
bun test
bun run check:boundary
```

Preferred operator script surface:

- `bun run setup`
- `bun run doctor`
- `bun run eval -- --pack <pack> --variant <variant> --config <config-path> --out <output-dir>`
- `bun run matrix -- --config <config-path>`
- `bun run report -- --run <run-dir>`
- `bun run summary -- --runs <runs-dir> --format markdown`
- `bun run compare -- --baseline <run-dir> --candidate <run-dir>`
- `bun run downloads [DatasetName]`
- `bun run beam:doctor`

## Interactive setup

```bash
bun run setup
```

The setup command asks for the minimum decisions needed to get started:

- which pack(s) to include in a starter config
- whether those packs should use `openai-compatible` or `opencode` where this repo supports both
- the basic global provider connection fields and default models needed by the selected packs
- whether to download repo-managed datasets now
- whether external prerequisites for BEAM, SWE-Bench, Terminal-Bench, or Tau-Bench are already in place so existing preflight checks should run
- where to write the starter config file

It writes a direct `version: 1` run config with only the selected baseline runs and `memoryBackend: none`, using top-level `providers` for global connections plus per-run `agentProvider` references and optional `agentModel` overrides. Pack-specific runtime blockers remain explicit in the generated flow output rather than being treated as solved.

The remaining tasks that still require human or external intervention are tracked in [`docs/operator-blockers.md`](./operator-blockers.md).

## Run a single pack

```bash
bun run eval -- --pack <pack> --variant <variant> --config <config-path> --out <output-dir>
```

Examples:

```bash
bun run eval -- --pack locomo --variant baseline --config config/examples/locomo-smoke.json --out runs/reference/locomo/baseline
bun run eval -- --pack longmemeval --variant baseline --config config/examples/longmemeval-smoke.json --out runs/reference/longmemeval/baseline
bun run eval -- --pack tau-bench --variant baseline --config config/examples/tau-bench-smoke.json --out runs/reference/tau-bench/baseline
```

## Summaries and comparisons

```bash
bun run report -- --run runs/reference/locomo/baseline
bun run summary -- --runs runs/reference --format markdown
```

`compare` works on any two normalized runs, but operator-facing docs should not imply committed AKM reference artifacts exist today. `src/memory/backends/akm.ts` is still a stub, so repo-level baseline-vs-AKM comparison claims remain blocked.

## CI

- PR CI: `.github/workflows/ci-pr.yml`
- Weekly smoke: `.github/workflows/smoke-schedule.yml`

## Reference runs

Committed reference artifacts live under `runs/reference/`.

Each reference run should be produced by running directly into its final destination so `result.json` artifact paths match committed files.

New runs now auto-capture `repoCommit` and `runnerType` in `result.json.metadata` when the local git checkout and provider config make those values available. Keep storing pack-specific fields like `benchmarkId` and `benchmarkVersion` truthfully, let unknown values remain unset, and for older committed references prefer an explicit provenance note over reconstructing `repoCommit` from surrounding commits.
