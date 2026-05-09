# Next Steps

This repo’s default path is committed configs plus `bin/doctor` and `bin/eval`.

## What Exists

- `bin/*` wraps the TypeScript implementation in `src/`.
- Packs normalize authoritative upstream artifacts to `result.json`, `summary.md`, and optional `raw-output.json`.
- `opencode` and `openai-compatible` are the only runner modes.
- Host-managed runtimes for BEAM, SWE-Bench, and Terminal-Bench live under `.akm/evals/venvs/`.
- Blocked packs and blocked memory backends fail explicitly.

## Main Gaps

- `akm-bench` has no authoritative external artifact contract.
- `memory.backend: akm` still lacks a documented add/search contract.
- `mem0`, `openviking`, and `zep` are placeholders without real runtimes.
- BEAM still needs external dataset prep and a real judge endpoint.
- `terminal-bench`, `tau-bench`, and `longmemeval` still have runner/path asymmetries.

## External Dependencies

- BEAM needs the upstream checkout, prepared datasets, and judge credentials.
- AKM memory integration needs an upstream contract, not more local scaffolding.
- `akm-bench` needs a real external process and authoritative artifact schema.

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
2. Decide whether `akm` memory stays blocked or gets a real upstream contract.
3. Define the authoritative `akm-bench` artifact boundary.
4. Add regression tests for blocked packs and blocked memory backends.
5. Consolidate operator status into one runnable/blocked matrix.
6. Keep smoke configs, pack READMEs, and top-level docs synchronized with actual support.
