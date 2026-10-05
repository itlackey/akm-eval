---
name: debt-inventory
description: Build a deduplicated technical-debt inventory with file-level evidence, benefit, effort, regression risk, confidence, and action. Use after a read-only baseline; do not use to list generic smells or implement findings.
compatibility: Requires an assessed source repository and write access only to the approved report path.
metadata:
  version: "1.0.1"
  akm-type: "skill"
  akm-updated: "2026-08-06"
updated: 2026-08-06
---

# Debt Inventory

## When To Use It

Use after baseline assessment to convert observed duplication, dead code,
coupling, complexity, test gaps, stale documentation, and operational risks into
reviewable findings.

## When Not To Use It

Do not use before repository orientation, as a style-opinion list, or to turn
tool warnings into findings without source confirmation.

## Required Inputs

- Repository assessment and architecture map
- Scope and baseline failures
- Existing static-analysis, dependency, security, and coverage output
- `skills/coding/debt-inventory/assets/inventory-template.md`

## Procedure

1. Inspect duplicate implementations, unreachable code, dependencies, cycles,
   layer violations, oversized responsibilities, branching, error handling,
   characterization gaps, obsolete compatibility code, stale docs, and
   security, reliability, or performance risks.
2. Confirm each candidate in current code and assign a stable `TD-NNN` ID.
3. Capture paths, symbols, line ranges or commands, evidence, expected benefit,
   effort, regression risk, confidence, and recommended action.
4. Record counter-evidence and indirect-use uncertainty.
5. Merge findings with the same cause; do not inflate counts with symptoms.
6. During read-only assessment, keep the draft under `.refactoring/`. After that
   phase closes and report promotion is approved, write the reviewed inventory
   to `knowledge/coding/technical-debt/inventory.md` in the stash, or to
   `docs/technical-debt/inventory.md` in a target repository, without changing
   source code.

## Constraints

- Do not modify source code.
- A tool score alone is not evidence of debt.
- Do not label code dead until indirect, generated, configuration-driven,
  reflective, plugin, serialization, and external use have been checked.
- Do not present a behavior change as cleanup.

## Expected Output

A table and detailed entries for every finding with ID, category, paths and
symbols, evidence, benefit, effort, risk, confidence, action, required tests,
and approval needs. Include rejected candidates and why they were rejected.

## Verification

Confirm every cited path exists, every symbol or line range resolves, every
quantitative claim has a reproducible command, and all required template fields
are populated. Sample high-priority findings manually against source.

## Stop Or Escalation Conditions

Stop assigning actionable status when evidence is inaccessible, use may be
external, expected behavior is disputed, or the finding depends on a public API
or data migration. Mark it `needs investigation` and state the evidence or
owner required.
