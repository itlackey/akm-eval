---
name: refactoring-plan
description: Rank evidenced debt and divide it into small behavior-preserving slices with tests, verification, approval gates, and rollback guidance. Use after inventory; do not use to plan speculative rewrites or unverified findings.
compatibility: Requires a completed debt inventory and repository verification commands.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Refactoring Plan

## When To Use It

Use to turn an evidence-backed inventory into an auditable priority order and a
sequence of independently reviewable slices.

## When Not To Use It

Do not use when findings lack evidence, expected behavior is unknown, or the
request is an open-ended rewrite rather than bounded remediation.

## Required Inputs

- Reviewed debt inventory
- Repository policy, baseline, and architecture map
- Delivery constraints and approval authority
- `skills/coding/refactoring-plan/references/priority-rubric.md` and
  `skills/coding/refactoring-plan/assets/roadmap-template.md`

## Procedure

1. Reconfirm each candidate's premise and occurrence count.
2. Score impact, confidence, effort, and regression risk using the shared rubric.
3. Calculate `impact x confidence / (effort x regression risk)` and retain all
   component scores; do not let the number override safety judgment.
4. Reject or defer cosmetic, speculative, low-confidence, and rewrite-shaped
   work.
5. Split selected work into slices that address one concern and can be reviewed,
   verified, and rolled back independently.
6. For each slice, list affected files, unchanged behavior, characterization
   tests, implementation checks, full verification, rollback, and stop gates.
7. Select the smallest high-value, low-risk pilot and request approval where
   required.

## Constraints

- No unrelated cleanup or broad formatting.
- Separate mechanical changes from behavior, dependency upgrades, migrations,
  and architecture changes.
- High-risk architecture, public API, dependency addition, migration, and
  behavioral changes require human approval.
- Prefer a smaller slice over a more comprehensive one.

## Expected Output

A ranked roadmap with transparent scores, dependencies, rejected candidates,
and slice cards containing scope, preserved behavior, files, tests, commands,
rollback, approval needs, and stop conditions.

## Verification

Trace every slice to one or more inventory IDs. Confirm its file list is bounded,
its tests can fail for the targeted regression, its commands exist, and its
rollback does not discard unrelated work.

## Stop Or Escalation Conditions

Stop planning a slice when it cannot be independently tested or rolled back,
depends on disputed behavior, requires an unapproved contract change, or grows
into subsystem replacement. Escalate the disputed decision rather than hiding
it inside implementation detail.
