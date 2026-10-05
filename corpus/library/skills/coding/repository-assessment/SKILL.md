---
type: skill
name: repository-assessment
description: Perform a read-only assessment of an existing repository. establish
  its verification baseline, contracts, and constraints. Use before planning
  technical-debt work; do not use to edit source or implement fixes.
compatibility: Requires repository read access and permission to run existing
  non-destructive verification commands.
metadata:
  version: 1.0.0
  akm-type: skill
  akm-updated: 2026-07-26
updated: 2026-07-26
when_to_use: Use at the start of a cleanup engagement, after changing
  repositories, or when the current branch, commands, contracts, and baseline
  failures are unknown.
generated:
  by: akm/0.9.1
  at: 2026-08-29T03:15:17.291Z
verified:
  - by: akm/0.9.1
    at: 2026-08-24T07:15:02.980Z
  - by: akm/0.9.1
    at: 2026-08-28T07:15:02.210Z
  - by: akm/0.9.1
    at: 2026-08-29T03:15:17.291Z
---

# Repository Assessment

## When To Use It

Use at the start of a cleanup engagement, after changing repositories, or when the current branch, commands, contracts, and baseline failures are unknown.

## When Not To Use It

Do not use to fix findings, install tools, update dependencies, format files, or write an implementation plan based on assumptions.

## Required Inputs

- Repository root and assessment scope
- Applicable instruction files
- Permission to run existing non-destructive checks
- Output location under `.refactoring/` or standard output

## Procedure

1. Record branch, commit, worktree status, and submodule or workspace layout.
2. Read README files, contribution guidance, architecture records, manifests, CI workflows, ownership rules, and nested agent instructions.
3. Discover actual bootstrap, build, format, lint, static-analysis, type-check, test, coverage, package, security, dependency, compatibility, and benchmark commands. Do not invent missing commands.
4. Identify generated and protected paths, public APIs, compatibility promises, module boundaries, and external consumers.
5. Run `scripts/skills/coding/technical-debt-workflow/refactoring/baseline --root <repository-root>` or the discovered commands directly. Never omit `--root` for an external stash. Record raw exit status and classify pre-existing failures.
6. Compare repository state before and after. Treat new unignored files or modifications as a read-only breach unless they are documented tool output.
7. Fill `skills/coding/repository-assessment/assets/assessment-template.md` with observations and unknowns.

## Constraints

- Do not edit source, tests, configuration, lockfiles, migrations, or docs.
- Write only ignored evidence under `.refactoring/`.
- Do not install dependencies or run a command with destructive, production, migration, deployment, or credential side effects.
- Separate observed facts from hypotheses and recommendations.

## Expected Output

A baseline report containing repository state, instruction sources, command matrix, check results, public contracts, boundaries, generated paths, existing failures, unknowns, and a statement confirming whether assessment stayed read-only.

## Verification

Compare `git status --porcelain` before and after, excluding the approved evidence path. Cite the file or command source for every discovered command and retain each check's exit code in the baseline artifact.

## Stop Or Escalation Conditions

Stop a command when it may modify production, data, dependencies, generated artifacts, or secrets; requires unavailable credentials; or has no documented safe mode. Continue read-only inspection, mark the check unavailable or skipped with its reason, and ask before broadening access.
