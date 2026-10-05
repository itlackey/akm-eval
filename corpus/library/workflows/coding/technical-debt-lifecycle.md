---
type: workflow
description: Execute the evidence-first technical-debt lifecycle from read-only baseline through one approved slice and final review.
when_to_use: Use for repeatable repository cleanup engagements that require assessment, approval gates, verification, and auditable reporting.
params:
  repository:
    type: string
    description: Repository root to assess.
  scope:
    type: string
    description: Requested paths, packages, or concerns.
  approval_ref:
    type: string
    description: Optional approval reference; required before execution.
steps:
  - id: baseline
  - id: inventory-and-rank
  - id: approval
  - id: execute
  - id: verify-and-review
updated: 2026-07-26
---

# Workflow: Technical Debt Lifecycle

The canonical procedure is `skills/coding/technical-debt-workflow`; the canonical
safety rules are `knowledge/coding/technical-debt/refactoring-policy.md`. This
workflow is an AKM execution entry point, not a second policy.

## baseline

### Instructions

Run `skills/coding/repository-assessment` read-only for `{{ repository }}` and
`{{ scope }}`. Execute
`scripts/skills/coding/technical-debt-workflow/refactoring/baseline --root {{ repository }}`,
record repository state, commands, contracts, boundaries, generated paths, and
pre-existing failures. Permit writes only under ignored `.refactoring/`.

### Completion Criteria

- Baseline artifact exists with per-check status and exit code.
- Source worktree is unchanged by assessment.
- Unknown or unsafe commands are marked, not guessed or installed.

## inventory-and-rank

### Instructions

Run `skills/coding/architecture-review`, `skills/coding/debt-inventory`,
`skills/coding/test-gap-analysis`, and `skills/coding/refactoring-plan`. Cite
current files and symbols, verify finding premises, rank with retained score
inputs, and propose one smallest high-value pilot.

### Completion Criteria

- Every actionable finding has complete evidence and risk fields.
- Every roadmap slice maps to findings and defines tests, commands, rollback,
  approvals, and stop conditions.
- Pilot is bounded and behavior-preserving, or explicitly waits for approval.

## approval

### Instructions

Present the pilot and wait. Require `{{ approval_ref }}` before execution.
Always require explicit human approval for behavior, public API, dependency,
migration, protected-data, or high-risk architecture changes.

### Completion Criteria

- Approval identifies one slice and any accepted behavioral risk.
- Without approval, workflow state is `blocked`, not `completed`.

## execute

### Instructions

Run `skills/coding/refactoring-executor` in a dedicated branch or worktree. Add
missing characterization tests first, make the smallest coherent change, remove
replaced code, synchronize affected docs, and run targeted checks.

### Completion Criteria

- Diff is limited to the approved concern.
- Replaced code is removed and preserved behavior is covered.
- Scope expansion returns to the approval step.

## verify-and-review

### Instructions

Run `scripts/skills/coding/technical-debt-workflow/refactoring/verify --root {{ repository }}`,
`scripts/skills/coding/technical-debt-workflow/refactoring/report --root {{ repository }}`,
`skills/coding/regression-verification`, and `skills/coding/refactoring-review`.
Compare raw evidence with the final report.

### Completion Criteria

- All required checks pass or final state is `failed` or `blocked`.
- Findings-first review has no unresolved blocking issue.
- Report includes changed files, decisions, simplification, tests, exact
  results, metrics, limitations, remaining debt, rollback, and next slice.
