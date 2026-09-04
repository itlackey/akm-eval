# Next Steps

This repo’s default path is committed configs plus `bin/doctor` and `bin/eval`.

This repo is scoped to memory / long-term-recall benchmarks. Coding benchmarks
(`swe-bench`, `terminal-bench`, akm's own task corpus) live in the separate
[`akm-bench`](https://github.com/itlackey/akm-bench) repo, which runs them through Harbor; see
`docs/benchmark-packs.md`.

## Staged consolidation

The proposed `akm-evals` monorepo would put both projects in one operator-facing
repository while retaining this boundary between separate packages. The phased
container-first migration and its acceptance criteria are in
[`docs/monorepo-migration.md`](./monorepo-migration.md). That proposal remains
staged work tracked in
[#21](https://github.com/itlackey/akm-eval/issues/21); it does not change the
current ownership described above.

## What Exists

- `bin/*` wraps the TypeScript implementation in `src/`.
- Packs normalize authoritative upstream artifacts to `result.json`, `summary.md`, and optional `raw-output.json`.
- `opencode` and `openai-compatible` are the only runner modes.
- Operator commands use prebuilt core/BEAM containers; the host checkout only
  supplies configs, datasets, source provenance, and result storage.
- Blocked packs and blocked memory backends fail explicitly.
- `judgedPass` for `longmemeval` comes only from the pack's official `evaluatorCommand` output; there is no local heuristic judge in this repo.

## Main Gaps

- `memory.backend: akm` is a real, evaluated adapter (subprocess akm CLI,
  deterministic frontmatter synthesis, hermetic per-instance state) — see
  `docs/memory-backends.md`. Published targets use an explicit version-selected
  image; source targets use `AKM_EVAL_AKM_CMD` plus a read-only source mount.
- BEAM still needs external dataset prep and a real judge endpoint.
- `tau-bench` and `longmemeval` still have runner/path asymmetries.

## External Dependencies

- BEAM needs the upstream checkout, prepared datasets, and judge credentials.
- AKM memory integration needs an explicit published version or mounted source
  checkout; it does not require a host CLI installation.

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
