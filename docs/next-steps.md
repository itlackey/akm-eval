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
- Operator commands use prebuilt core/BEAM containers; the host checkout only
  supplies configs, datasets, source provenance, and result storage.
- Blocked packs and blocked memory backends fail explicitly.
- `judgedPass` for `longmemeval` comes only from the pack's official `evaluatorCommand` output; there is no local heuristic judge in this repo.

## Main Gaps

- BEAM still needs external dataset prep and a real judge endpoint.
- `tau-bench` and `longmemeval` still have runner/path asymmetries.

## External Dependencies

- BEAM needs the upstream checkout, prepared datasets, and judge credentials.
- AKM memory integration requires an explicit published version or source
  checkout; both are built into versioned Docker images and do not require a
  host CLI installation.

## Doc Gaps

- The BEAM handoff path could be shorter and more procedural.
- More provider-specific, copy-and-edit config examples would make custom
  OpenAI-compatible deployments easier to start safely.

## Test Gaps

- No end-to-end CI path exercises real harnesses across doctor, eval, and report.
- Blocked-backend regressions need tighter coverage.
- Docs/config sync is only partially enforced by tests.
- BEAM preflight permutations need more coverage.

## Priority Next Actions

1. Finalize BEAM operator handoff and evidence capture.
2. Add regression tests for blocked packs and blocked memory backends.
3. Add tested provider-specific starter configs without embedding secrets.
4. Keep smoke configs, pack READMEs, and top-level docs synchronized with actual support.
