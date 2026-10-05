---
name: refactoring-executor
description: Execute exactly one approved behavior-preserving refactoring slice in isolation, with characterization tests, targeted checks, full verification, and a before-and-after report. Use only after approval; do not use for assessment or unapproved changes.
compatibility: Requires an approved slice, repository edit access, verification commands, and Git isolation when Git is available.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Refactoring Executor

## When To Use It

Use after a human or authorized workflow approves one slice with explicit scope,
preserved behavior, tests, verification, and rollback.

## When Not To Use It

Do not use during assessment, for multiple unrelated findings, or when approval,
baseline evidence, behavior, or rollback is missing.

## Required Inputs

- Approved slice ID and exact acceptance criteria
- Allowed files and unchanged-behavior statement
- Baseline artifact and existing failures
- Targeted and full verification commands
- Rollback guidance and approval record

## Procedure

1. Confirm worktree status and create a dedicated branch or worktree without
   stashing, discarding, or merging unrelated work.
2. Re-run the relevant baseline check in the isolated workspace.
3. Add characterization tests first when current behavior is not already pinned.
4. Make the smallest coherent mechanical change.
5. Remove replaced code immediately; do not leave parallel implementations.
6. Run targeted checks after each meaningful step.
7. Update affected tests and documentation without broad cleanup.
8. Run
   `scripts/skills/coding/technical-debt-workflow/refactoring/verify --root <repository-root>`,
   inspect the full diff, and prepare a report from
   `skills/coding/refactoring-executor/assets/execution-report-template.md`.

## Constraints

- Stay inside the approved concern and files unless a newly discovered required
  file is approved.
- Never weaken tests, add unexplained suppressions, or change public contracts.
- Do not add dependencies, touch migrations or lockfiles, or change behavior
  unless the slice explicitly approves it.
- Do not commit, merge, push, or delete a worktree unless requested.

## Expected Output

A reviewable diff and report covering the problem, files, design decisions,
deletions or simplifications, tests, exact command results, meaningful metrics,
limitations, remaining debt, and proposed next slice.

## Verification

Required checks must pass relative to the recorded baseline. Compare observed
behavior before and after, inspect for scope drift, and run
`scripts/skills/coding/technical-debt-workflow/refactoring/report --root <repository-root>`.
Report failures and skips verbatim.

## Stop Or Escalation Conditions

Stop immediately when behavior differs, scope expands, an API or schema must
change, a dependency or migration becomes necessary, a required check regresses,
or rollback becomes unsafe. Preserve evidence and request approval for a revised
slice; do not improvise around the gate.
