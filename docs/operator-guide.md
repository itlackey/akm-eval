# Operator guide

## Goal

Run benchmark packs locally or in CI using only authoritative upstream harnesses and reproducible normalized outputs.

## Core commands

```bash
bun install
bun run download:datasets
bun src/cli.ts doctor
bun test
bun run check:boundary
```

## Run a single pack

```bash
bun src/cli.ts run --pack <pack> --variant <variant> --config <config-path> --out <output-dir>
```

Examples:

```bash
bun src/cli.ts run --pack locomo --variant baseline --config config/examples/locomo-smoke.json --out runs/reference/locomo/baseline
bun src/cli.ts run --pack longmemeval --variant baseline --config config/examples/longmemeval-smoke.json --out runs/reference/longmemeval/baseline
bun src/cli.ts run --pack tau-bench --variant baseline --config config/examples/tau-bench-smoke.json --out runs/reference/tau-bench/baseline
```

## Summaries and comparisons

```bash
bun src/cli.ts report --run runs/reference/locomo/baseline
bun src/cli.ts summary --runs runs/reference --format markdown
```

`compare` works on any two normalized runs, but operator-facing docs should not imply committed AKM reference artifacts exist today. `src/memory/backends/akm.ts` is still a stub, so repo-level baseline-vs-AKM comparison claims remain blocked.

## CI

- PR CI: `.github/workflows/ci-pr.yml`
- Weekly smoke: `.github/workflows/smoke-schedule.yml`

## Reference runs

Committed reference artifacts live under `runs/reference/`.

Each reference run should be produced by running directly into its final destination so `result.json` artifact paths match committed files.

New runs now auto-capture `repoCommit` and `runnerType` in `result.json.metadata` when the local git checkout and provider config make those values available. Keep storing pack-specific fields like `benchmarkId` and `benchmarkVersion` truthfully, let unknown values remain unset, and for older committed references prefer an explicit provenance note over reconstructing `repoCommit` from surrounding commits.
