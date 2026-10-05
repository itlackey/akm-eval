---
name: architecture-review
description: Map current module boundaries, dependency direction, public seams, cycles, and layer violations using repository evidence. Use during read-only debt assessment; do not use to invent a replacement architecture or rewrite a subsystem.
compatibility: Works with source repositories and their existing dependency or static-analysis tools.
metadata:
  version: "1.0.0"
  akm-type: "skill"
  akm-updated: "2026-07-26"
updated: 2026-07-26
---

# Architecture Review

## When To Use It

Use when boundaries, dependency direction, ownership, or coupling affect the
safety and priority of a proposed refactor.

## When Not To Use It

Do not use for greenfield architecture, aesthetic reorganizations, or broad
redesign without evidence that current structure causes a concrete problem.

## Required Inputs

- Repository assessment and scope
- Source layout, manifests, and architecture documentation
- Existing import, dependency, or cycle-analysis commands
- Known public and runtime entry points

## Procedure

1. Identify runtime, domain, data, interface, infrastructure, and test areas
   from code and build configuration rather than directory names alone.
2. Trace representative entry points to side effects and external boundaries.
3. Record allowed and observed dependency directions.
4. Use existing tools plus targeted searches to find cycles, reverse-layer
   imports, hidden service location, shared mutable state, and unclear owners.
5. Confirm each candidate with concrete importer and imported symbols.
6. Distinguish an actual violation from an intentional public seam.
7. Populate `skills/coding/architecture-review/assets/architecture-map-template.md`.

## Constraints

- Remain read-only.
- Do not infer a rule solely from folder names or recommend moving files solely
  for symmetry.
- Do not propose an abstraction until occurrence counts and type compatibility
  prove the premise.
- Treat framework registration, plugins, reflection, generated imports, and
  external consumers as possible edges.

## Expected Output

An evidence-backed boundary map with components, responsibilities, dependency
rules, public seams, confirmed violations, cycles, uncertainty, and candidate
bounded actions.

## Verification

For every reported edge, cite both endpoints and the import, call, registration,
or configuration evidence. Re-run the repository's dependency validator when
available and record unsupported portions as unverified.

## Stop Or Escalation Conditions

Stop recommending structural movement when ownership or runtime wiring is
ambiguous, generated edges cannot be reconstructed, or a fix would cross public
contracts, persistence, deployment, or multiple team boundaries. Request a
domain owner decision before planning that change.
