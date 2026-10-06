---
name: assess-technical-debt
type: command
description: Run a read-only repository baseline, architecture.
  review, debt inventory, ranking, and pilot proposal.
when_to_use: Use before any cleanup edits when the repository's current debt, constraints, and safest first slice are not yet established.
updated: 2026-07-26
---

# Assess Technical Debt

Target and scope: `$ARGUMENTS`

Read `knowledge/coding/technical-debt/refactoring-policy.md` and execute
`skills/coding/technical-debt-workflow` only through its assessment, inventory,
and planning phases.

- Do not modify source, tests, configuration, dependencies, lockfiles,
  migrations, generated artifacts, or documentation.
- Write temporary evidence only under `.refactoring/`.
- Run the existing verification baseline and distinguish pre-existing failures.
- Cite actual paths and symbols for every finding.
- Rank findings and propose one smallest high-value, low-risk pilot.
- Include benefit, files, regression risk, tests, commands, rollback, approval
  needs, and stop conditions.
- Stop before execution and request approval.
