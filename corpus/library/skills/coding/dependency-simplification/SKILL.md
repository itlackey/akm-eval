---
name: dependency-simplification
description: Remove, consolidate, or narrow unnecessary dependencies using manifest, import, runtime, licensing, and build evidence. Use for a bounded dependency-reduction slice; do not use for routine upgrades or adding convenience packages.
compatibility: Requires the repository's existing package-manager and dependency validation commands.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Dependency Simplification

## When To Use It

Use when an inventory identifies an unused dependency, duplicate capability,
over-broad package boundary, or dependency whose removal clearly reduces risk
or complexity.

## When Not To Use It

Do not use for bulk upgrades, vulnerability remediation that changes versions,
or adding a library solely to shorten local code.

## Required Inputs

- Candidate package and declared use sites
- Manifests, lockfiles, workspace graph, and package-manager commands
- Runtime/build/plugin usage evidence
- `skills/coding/dependency-simplification/references/dependency-checklist.md`

## Procedure

1. Trace declarations, direct imports, transitive use, scripts, plugins, peer
   requirements, generated code, and deployment packaging.
2. Confirm whether the dependency is runtime, development, optional, peer, or
   externally supplied.
3. Estimate replacement code and operational impact; prefer deletion over a
   home-grown substitute that increases complexity.
4. Define one approved removal or consolidation slice.
5. Change manifests and required lockfiles together only when the approved task
   requires it; avoid unrelated resolution churn.
6. Run package-manager validation, build, tests, security checks, and packaging.

## Constraints

- Do not add dependencies without explicit approval and demonstrated net
  complexity reduction.
- Do not hand-edit generated lockfile content.
- Do not combine removal with version upgrades or broad manifest formatting.
- Account for licenses, platform variants, optional features, and supply-chain
  policy.

## Expected Output

Usage evidence, retained or removed decision, affected manifests and imports,
dependency-graph delta, lockfile explanation, checks, risks, and rollback.

## Verification

Use the repository package manager to regenerate and validate required artifacts.
Confirm clean installation or equivalent packaging in an isolated environment
when available, then run the full configured suite.

## Stop Or Escalation Conditions

Stop when use may be dynamic or external, package-manager output causes unrelated
churn, replacement behavior differs, licensing or deployment ownership is
unclear, or removal requires a public contract change.
