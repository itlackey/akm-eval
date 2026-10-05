---
name: documentation-sync
description: Reconcile documentation with an approved implementation using source, tests, and public-contract evidence. Use after behavior or structure is settled; do not use to speculate, hide unresolved design, or broaden a refactoring slice.
compatibility: Requires access to implementation, tests, documentation, and documentation validation commands.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Documentation Sync

## When To Use It

Use when an approved slice changes internal structure, commands, public
contracts, examples, diagrams, or maintenance guidance reflected in docs.

## When Not To Use It

Do not use before implementation is stable, to document intended behavior that
does not exist, or for unrelated editorial cleanup.

## Required Inputs

- Approved slice and final diff
- Current implementation and tests
- Documentation ownership and generation rules
- Link, example, schema, or docs-build commands
- `skills/coding/documentation-sync/references/sync-checklist.md`

## Procedure

1. Search for references to changed symbols, paths, commands, behavior, diagrams,
   and compatibility statements.
2. Classify each reference as current, stale, generated, historical, or out of
   scope.
3. Update only affected source documentation; regenerate generated docs through
   their owning tool when the slice authorizes it.
4. Keep examples executable and align claims with tests or source evidence.
5. Record intentionally retained historical or compatibility documentation.
6. Run docs validation and the full verification suite.

## Constraints

- Do not hand-edit generated documentation.
- Do not change product behavior through examples or normative prose.
- Avoid unrelated wording, formatting, and link cleanup.
- Public documentation changes that alter a contract require explicit approval.

## Expected Output

A list of synchronized references, exact evidence for each changed claim,
generated-doc actions, validation results, and remaining known documentation
gaps.

## Verification

Run existing documentation build, link, example, schema, and spell/style checks
where applicable. Search again for stale names and paths, and compare normative
claims with public tests or implementation.

## Stop Or Escalation Conditions

Stop when implementation and documentation disagree on expected behavior,
ownership is unclear, regeneration requires unavailable tooling, or the needed
doc change would expose or alter an unapproved public contract.
