---
name: refactoring-review
description: Review a completed refactoring slice findings-first for regressions, scope drift, contract changes, missing tests, and unsupported success claims. Use as the final independent gate; do not use on incomplete implementation or to rubber-stamp a plan.
compatibility: Requires the approved slice, final diff, baseline, verification evidence, and repository policy.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Refactoring Review

## When To Use It

Use after implementation and full verification are complete, before merge or
delivery, with enough evidence to render an independent verdict.

## When Not To Use It

Do not use as a motivational checkpoint on partial work, to review only the
author's summary, or when raw diff and check output are unavailable.

## Required Inputs

- Canonical policy and approved slice
- Baseline and final verification artifacts
- Complete diff and changed-file list
- Tests and before-and-after report
- `skills/coding/refactoring-review/assets/review-rubric.md`

## Procedure

1. Read the approved concern and unchanged-behavior statement.
2. Inspect the diff before reading implementation rationale.
3. Report findings in severity order with file and line references.
4. Check scope, public contracts, error semantics, side effects, security,
   performance, test quality, deleted-code proof, and documentation.
5. Compare every success claim with raw verification evidence.
6. Render `approve`, `request changes`, or `block`; list residual risks and the
   smallest required fix.

## Constraints

- Remain read-only unless explicitly asked to implement review fixes.
- Do not approve with unresolved blocking findings or failed required checks.
- Do not penalize absence of unrelated cleanup.
- Treat pre-existing failures separately, but do not call the slice fully
  verified while required checks remain red.

## Expected Output

Findings first, ordered by severity, with locations, consequence, evidence, and
smallest fix; then open questions, verification audit, verdict, residual risks,
and optional next slice.

## Verification

Trace every finding to the diff or evidence. Confirm all changed files map to
the approved slice and each required check's reported state matches its exit
code. State explicitly when no findings are discovered.

## Stop Or Escalation Conditions

Block review when implementation is incomplete, the diff is unavailable or
mixed with unrelated work, required evidence is missing, behavior changed
without approval, or a public, security, migration, or dependency gate was
bypassed.
