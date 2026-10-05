# Refactoring Lifecycle Reference

## Phase Status

Each phase ends in exactly one state:

- `passed`: all required completion criteria have evidence.
- `failed`: a required check ran and failed or a regression was observed.
- `blocked`: required input, access, approval, or safe verification is missing.
- `partial`: optional analysis is incomplete, but no success claim depends on it.

`skipped`, `unavailable`, and `timed_out` are check results, not successful phase
states. A phase with a required result in one of those states is `blocked` or
`failed` as appropriate.

## Phase 1: Baseline

Inputs: repository root, scope, instructions, and permission to run existing
non-destructive checks.

Required hand-off evidence:

- branch, commit, and dirty-state snapshot;
- applicable instruction and policy files;
- command matrix with provenance;
- per-command status, exit code, duration, and captured output location;
- public contracts, boundaries, generated paths, and existing failures;
- before/after worktree comparison proving assessment did not change source.

No source, test, configuration, dependency, documentation, migration, lockfile,
or generated-artifact edits are allowed.

## Phase 2: Inventory

Every finding needs a stable ID and direct evidence. Keep unresolved candidates
separate from actionable findings. Reject candidates when the stated premise is
false, the benefit is cosmetic, or a tool signal cannot be confirmed in code.

Required hand-off evidence:

- finding schema is complete;
- cited paths and symbols exist;
- occurrence counts are reproducible;
- indirect-use uncertainty is explicit;
- security and reliability findings are not overstated.

## Phase 3: Plan

Rank only confirmed findings. A score assists ordering but does not override an
approval gate. Each slice must be independently reviewable, testable, and
reversible.

Human approval is mandatory for:

- public API or compatibility changes;
- behavioral or error-semantics changes;
- high-risk architecture or ownership-boundary changes;
- dependency additions or broad upgrades;
- data, schema, or migration changes;
- production access or protected artifact changes.

## Phase 4: Execute

Use one dedicated branch or worktree per approved slice when Git is available.
Do not merge, push, or delete isolation resources unless the user requests it.

Execution order:

1. Confirm approval, scope, baseline, rollback, and unchanged behavior.
2. Add missing characterization tests and prove they pass on the baseline.
3. Apply one minimal mechanical change.
4. Delete replaced code in the same change.
5. Run targeted checks.
6. Synchronize affected documentation.
7. Run full verification and inspect the final diff.

Any expansion returns the slice to planning and approval.

## Phase 5: Review

The reviewer sees the approved slice, raw diff, baseline, and verification
artifacts. The reviewer must not rely solely on the implementer's narrative.

Completion requires:

- no unresolved blocking findings;
- no unapproved scope or contract changes;
- all required checks passed;
- every report claim matches raw evidence;
- known limitations and remaining debt are explicit.

## Evidence Retention

Keep command artifacts under ignored `.refactoring/`. Promote only reviewed
inventory, roadmap, and slice reports into
`knowledge/coding/technical-debt/`. Never commit logs containing secrets,
credentials, production data, or unredacted personal information.
