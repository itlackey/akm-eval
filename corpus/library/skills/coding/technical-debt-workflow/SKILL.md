---
name: technical-debt-workflow
description: Orchestrate evidence-first repository assessment, debt inventory, prioritization, one approved refactoring slice, and regression review. Use for end-to-end technical-debt cleanup requests; do not use for feature delivery or an unapproved behavior change.
compatibility: Requires repository read access; execution uses Git when available and repository-provided verification commands.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Technical Debt Workflow

## When To Use It

Use for a repository-wide or scoped cleanup engagement that needs assessment,
ranking, approval gates, bounded execution, and evidence-backed reporting.

## When Not To Use It

Do not use for feature work, incident response, a known single-line fix, or a
request that already provides one approved and fully specified refactoring
slice. Route those directly to the relevant focused skill.

## Required Inputs

- Repository root and requested scope
- Applicable repository instructions and canonical policy
- Approval authority and any deadline or risk tolerance
- Existing verification commands, if known
- Explicit behavioral changes, if any; default is none

## Procedure

1. Read `knowledge/coding/technical-debt/refactoring-policy.md` and applicable
   repository instructions.
2. Run `skills/coding/repository-assessment` read-only and execute
   `scripts/skills/coding/technical-debt-workflow/refactoring/baseline --root <repository-root>`
   using discovered commands. Never omit `--root` when invoking the external
   stash tooling.
3. Run `skills/coding/architecture-review`, `skills/coding/debt-inventory`, and
   `skills/coding/test-gap-analysis` as read-only analyses. Keep facts separate
   from recommendations.
4. Run `skills/coding/refactoring-plan`; verify each finding's premise before
   ranking it.
5. Propose the smallest high-value, low-risk pilot and wait for approval when
   the slice crosses any policy gate.
6. For an approved slice only, run `skills/coding/refactoring-executor` in an
   isolated branch or worktree, then `skills/coding/documentation-sync` if
   documentation changed in meaning.
7. Run `skills/coding/regression-verification` and
   `skills/coding/refactoring-review` independently.
8. Produce the final report using
   `skills/coding/technical-debt-workflow/assets/slice-report-template.md`.

Read `skills/coding/technical-debt-workflow/references/lifecycle.md` only when
phase hand-offs or status semantics need more detail. Read
`skills/coding/technical-debt-workflow/references/primary-references.md` before
changing skill format, client adapters, or evaluation assumptions.

## Constraints

- Assessment is read-only except for ignored evidence under `.refactoring/`.
- Preserve observable behavior unless a behavioral change is explicitly
  approved and separated from mechanical work.
- Execute one coherent slice at a time; do not bundle upgrades, formatting,
  feature work, and architecture changes.
- Never weaken tests, suppress unexplained warnings, or treat baseline failures
  as permission for new failures.
- Prefer deletion and simplification; no hypothetical abstractions.

## Expected Output

- Baseline with passed, failed, timed-out, unavailable, and skipped checks
- File- and symbol-level debt inventory with confidence and risk
- Prioritized roadmap with approval gates and rollback guidance
- Pilot proposal, or a completed approved slice with before-and-after evidence
- Final status that never overstates incomplete verification

## Verification

Run
`scripts/skills/coding/technical-debt-workflow/refactoring/verify --root <repository-root>`
after execution and
`scripts/skills/coding/technical-debt-workflow/refactoring/report --root <repository-root>`
before review. Confirm the final diff is limited to the approved slice and every
required check has an explicit result.

## Stop Or Escalation Conditions

Stop before mutation when expected behavior, ownership, public contracts, or
architecture boundaries cannot be established; baseline commands are unsafe or
unknown; approval is missing; or the proposed slice changes behavior, public
API, dependencies, migrations, or high-risk architecture. Escalate with one
focused question and the evidence needed to decide.
