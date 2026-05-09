# Contributing

## Scope

`akm-eval` only wraps public third-party benchmarks with authoritative harnesses or evaluators. Do not add synthetic benchmarks, local proxy scoring, or AKM-internal attribution logic here.

## Adding a pack

Every new pack must satisfy all of the following:

- official upstream benchmark exists publicly
- authoritative local harness or evaluator can be invoked from this repo
- adapter trusts only upstream artifacts as the source of truth
- pack fails clearly when the official harness is unavailable
- no synthetic fallback scoring is introduced
- normalized `result.json`, `summary.md`, and optional `raw-output.json` are emitted
- pack-local README documents runtime dependencies, upstream source, and limitations

## Minimum implementation checklist

- add `src/packs/<name>/adapter.ts`
- add `src/packs/<name>/parse.ts`
- add `src/packs/<name>/scorer.ts`
- add `src/packs/<name>/README.md`
- register the pack in `src/packs/registry/index.ts`
- add any config validation needed in `src/config/validate-config.ts`
- add runnable example config under `config/common/` when operators should use it, or add starter material under `config/examples/runs/` only for compatibility flows
- add docs updates in `README.md`, `docs/benchmark-packs.md`, and `docs/running-evals.md`
- add tests for config visibility or pack-specific helpers where practical

## Trust-policy checklist

- no heuristic success metric
- no fake baseline provider
- no hidden fallback to a different harness
- no unpublished scoring logic that overrides upstream artifacts
- no pack should claim Verified/official support if the committed config or default path still targets a different dataset tier

## Validation

Run these before opening a PR:

```bash
bun test
bun run check:boundary
```
