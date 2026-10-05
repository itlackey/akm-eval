---
name: regression-verification
description: Compare an implemented slice with its baseline and run targeted plus full checks while reporting pass, fail, timeout, unavailable, and skipped states exactly. Use after code changes; do not use to fix failures or declare success from partial checks.
compatibility: Requires baseline evidence and the repository's configured verification commands.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Regression Verification

## When To Use It

Use after an approved slice is implemented and before review, commit, merge, or
any claim that behavior was preserved.

## When Not To Use It

Do not use as an implementation agent, to reinterpret red checks as acceptable,
or without a recorded baseline unless the limitation is explicit.

## Required Inputs

- Baseline artifact and approved slice
- Current diff and working-tree state
- Targeted and full verification commands
- Expected behavior and compatibility contracts
- `skills/coding/regression-verification/assets/verification-report-template.md`

## Procedure

1. Confirm the diff matches the approved files and concern.
2. Run targeted characterization and affected-package checks.
3. Run
   `scripts/skills/coding/technical-debt-workflow/refactoring/verify --root <repository-root>`
   for the complete configured suite.
4. Compare each result with baseline: passed, existing failure, new failure,
   fixed failure, timeout, unavailable, or skipped.
5. Run compatibility, security, and performance checks when the slice affects
   those surfaces.
6. Generate evidence with
   `scripts/skills/coding/technical-debt-workflow/refactoring/report --root <repository-root>`
   and independently inspect the report against raw exit codes.

## Constraints

- Never modify source or tests during verification.
- A retry may diagnose flakiness but does not erase the initial failure; record
  both attempts.
- Required skipped, unavailable, timed-out, or failed checks block success.
- Existing failures remain failures and must be distinguished from regressions.

## Expected Output

A command-by-command matrix, baseline comparison, diff-scope result, behavioral
evidence, limitations, and one final status: `passed`, `failed`, or `blocked`.

## Verification

Cross-check every status against command, timestamp, exit code, duration, and
captured output. Confirm that the report contains no success claim when a
required check lacks passing evidence.

## Stop Or Escalation Conditions

Stop and return `failed` for a new regression. Return `blocked` when required
commands are unsafe, unavailable, or missing; the baseline is incomparable; or
the diff contains unapproved behavior or scope.
