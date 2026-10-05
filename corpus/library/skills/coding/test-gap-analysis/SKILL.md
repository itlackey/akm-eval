---
name: test-gap-analysis
description: Identify missing behavior and characterization coverage around evidenced refactoring risks, then specify focused tests. Use during assessment or slice planning; do not use to chase a coverage percentage or rewrite healthy tests.
compatibility: Works with the target repository's existing test and coverage tooling.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Test Gap Analysis

## When To Use It

Use when a proposed refactor touches behavior not clearly pinned by tests or
when inventory findings need testable regression criteria.

## When Not To Use It

Do not use to maximize coverage mechanically, duplicate implementation details,
or weaken and replace existing tests for convenience.

## Required Inputs

- Proposed scope or inventory findings
- Existing tests, test commands, and coverage output when available
- Public contracts and expected behavior sources
- `skills/coding/test-gap-analysis/assets/test-gap-template.md`

## Procedure

1. Map affected behaviors, inputs, outputs, errors, side effects, boundaries, and
   compatibility promises to current tests.
2. Distinguish unit, integration, contract, end-to-end, security, and benchmark
   gaps by regression risk.
3. Identify brittle implementation assertions that would obstruct safe internal
   change without protecting behavior.
4. Propose the smallest characterization tests that fail on the feared
   regression and pass on current behavior.
5. Prioritize tests required before editing separately from desirable follow-up.
6. Keep analysis read-only unless the approved slice authorizes test changes.

## Constraints

- Coverage percentage is supporting evidence, not a finding by itself.
- Do not delete, skip, narrow, or loosen a test to accommodate a refactor.
- Avoid snapshot expansion and assertions on irrelevant internal structure.
- Preserve intentionally tested legacy behavior until change is approved.

## Expected Output

A behavior-to-test matrix with current evidence, gap, risk, recommended test
level, fixture needs, exact command, and whether the test is required before the
slice.

## Verification

For each proposed test, state the concrete regression it detects and prove the
repository has a command that executes it. When tests are implemented, show
that they pass before refactoring and remain unchanged or intentionally extended
afterward.

## Stop Or Escalation Conditions

Stop when expected behavior cannot be established from tests, docs, history,
usage, or an owner; test infrastructure would require a new dependency; or a
safe fixture would touch production data or secrets.
