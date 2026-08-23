# Next Steps

This repo’s default path is committed configs plus `bin/doctor` and `bin/eval`.

This repo is scoped to memory / long-term-recall benchmarks. Coding benchmarks
(`swe-bench`, `terminal-bench`, akm's own task corpus) live in the separate
[`akm-bench`](https://github.com/itlackey/akm-bench) repo, which runs them through Harbor; see
`docs/benchmark-packs.md`.

## What Exists

- `bin/*` wraps the TypeScript implementation in `src/`.
- Packs normalize authoritative upstream artifacts to `result.json`, `summary.md`, and optional `raw-output.json`.
- `opencode` and `openai-compatible` are the only runner modes.
- A host-managed BEAM runtime lives under `.akm/evals/venvs/beam`.
- Blocked packs and blocked memory backends fail explicitly.
- `judgedPass` for `longmemeval` comes only from the pack's official `evaluatorCommand` output; there is no local heuristic judge in this repo.

## Main Gaps

- `memory.backend: akm` is a real, evaluated adapter (subprocess akm CLI, deterministic
  frontmatter synthesis, hermetic per-instance install) — see `docs/memory-backends.md`. It still
  needs a real akm CLI reachable at run time (`AKM_EVAL_AKM_CMD`); see `docs/operator-blockers.md`
  item 3.
- `mem0`, `openviking`, and `zep` are placeholders without real runtimes.
- BEAM still needs external dataset prep and a real judge endpoint.
- `tau-bench` and `longmemeval` still have runner/path asymmetries.

## External Dependencies

- BEAM needs the upstream checkout, prepared datasets, and judge credentials.
- AKM memory integration needs a real akm CLI (`^0.9`) reachable to the process running evals —
  an operator install-or-point-at-a-checkout step, not further repo-internal work.

## Doc Gaps

- Status is spread across several docs instead of one compact operator matrix.
- The BEAM handoff path could be shorter and more procedural.
- Legacy setup has been removed.

## Test Gaps

- No end-to-end CI path exercises real harnesses across doctor, eval, and report.
- Blocked-backend regressions need tighter coverage.
- Docs/config sync is only partially enforced by tests.
- BEAM preflight permutations need more coverage.

## Priority Next Actions

1. Finalize BEAM operator handoff and evidence capture.
2. Add regression tests for blocked packs and blocked memory backends.
3. Consolidate operator status into one runnable/blocked matrix.
4. Keep smoke configs, pack READMEs, and top-level docs synchronized with actual support.
