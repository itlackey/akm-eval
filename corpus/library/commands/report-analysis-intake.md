---
name: report-analysis-intake
type: command
description: Normalize a reporting request into a complete intake packet.
  evidence gathering or analysis begins.
when_to_use: Use when starting a report, investigation, or analysis that needs
  clear objective, audience, deliverable, and constraints.
updated: 2026-05-11
---

# Report Analysis Intake

Normalize the request into a repeatable intake packet before research or analysis begins.

## Usage

```text
/report-analysis-intake $OBJECTIVE | $AUDIENCE | $DELIVERABLE | $CONSTRAINTS
```

If any input is missing, ambiguous, or contradictory, ask the minimum clarifying questions to resolve them before proceeding.

## Task

Use `skills/administrative/agent-team-reporting`, `agents/report-orchestrator`, and `assets/intake-template.md` to define the analysis run.

Inputs:
- **Objective**: $OBJECTIVE
- **Audience**: $AUDIENCE
- **Deliverable**: $DELIVERABLE
- **Constraints**: $CONSTRAINTS

## What this command does

1. Defines the objective, audience, deliverable, and deadline assumptions.
2. Separates included scope from excluded scope.
3. Identifies required evidence, likely sources, and missing inputs.
4. Notes dependencies, blockers, and success criteria.
5. Produces a ready-to-use intake packet for the rest of the workflow.

## Output Standard

Return:
- Completed intake packet
- Assumptions and exclusions
- Required evidence and source plan
- Blockers, gaps, or stop conditions
