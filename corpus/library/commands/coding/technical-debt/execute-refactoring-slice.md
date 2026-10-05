---
name: execute-refactoring-slice
type: command
description: Execute one approved refactoring slice with isolation, characterization tests, bounded edits, full verification, and evidence reporting.
when_to_use: Use only when an approved slice ID, scope, preserved behavior, verification commands, and rollback guidance are available.
updated: 2026-07-26
---

# Execute Refactoring Slice

Approved slice and approval reference: `$ARGUMENTS`

Read `knowledge/coding/technical-debt/refactoring-policy.md` and
`skills/coding/refactoring-executor`. Confirm the approval and baseline before
the first write. Execute exactly one slice in a dedicated branch or worktree,
add missing characterization tests first, remove replaced code, run targeted
checks, run
`scripts/skills/coding/technical-debt-workflow/refactoring/verify --root <repository-root>`,
and generate the final report.

Stop if scope grows, behavior differs, a public contract or dependency changes,
a migration becomes necessary, or a required check regresses. Do not commit,
merge, push, or delete worktrees unless explicitly requested.
