---
name: dead-code-removal
description: Prove and remove unreachable or unused code while checking indirect, generated, reflective, configuration-driven, plugin, and external usage. Use for a bounded deletion candidate; do not use when usage cannot be established.
compatibility: Requires repository search, build, test, and compatibility tools appropriate to the target language.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Dead Code Removal

## When To Use It

Use when specific symbols, files, flags, routes, or compatibility branches are
suspected to be unused and deletion would simplify the current system.

## When Not To Use It

Do not use from a linter warning alone, for public APIs with unknown consumers,
or where framework discovery and runtime registration cannot be inspected.

## Required Inputs

- Candidate paths and symbols
- Repository assessment and public-contract inventory
- Build, test, package, and compatibility commands
- `skills/coding/dead-code-removal/references/indirect-usage-checklist.md`

## Procedure

1. Search direct references, imports, exports, call sites, tests, docs, and history.
2. Check generated code, configuration, reflection, serialization, routing,
   dependency injection, plugins, templates, scripts, and external contracts.
3. Exercise the relevant runtime or build path when static proof is insufficient.
4. Classify the candidate as removable, externally constrained, conditional, or
   unresolved and record evidence.
5. For an approved removable candidate, add a guard test if absence could regress,
   delete the smallest complete unit, and remove only newly orphaned code.
6. Run targeted and full verification plus compatibility checks.

## Constraints

- Absence from text search is not proof of non-use.
- Do not delete tests merely because their implementation was removed; retain
  behavior-level coverage where the contract remains.
- Do not remove deprecation or compatibility paths without confirming support
  windows and external consumers.
- Keep deletion separate from replacement feature work.

## Expected Output

An evidence matrix for each candidate, a deletion diff for approved candidates,
tests protecting retained behavior, command results, and unresolved external-use
questions.

## Verification

Run repository search after deletion, build/package checks, affected tests, full
verification, and API/schema compatibility checks. Compare packaged or generated
exports when relevant.

## Stop Or Escalation Conditions

Stop deletion when any indirect-use channel remains unverified, the symbol is
public or serialized, support policy is unknown, runtime evidence conflicts with
static analysis, or verification cannot exercise the registration path.
