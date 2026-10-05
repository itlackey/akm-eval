---
name: report-analysis-orchestrator
type: command
description: Orchestrate the end-to-end report analysis workflow by chaining
  specialized commands, enforcing a review gate, and ensuring traceability.
when_to_use: Use when a reporting task requires coordinated intake, evidence
  gathering, structured analysis, draft production, and an explicit
  human/automated review gate in one run.
updated: 2026-05-11
---

# Report Analysis Orchestrator

Orchestrate the end-to-end report analysis workflow by chaining specialized commands. This orchestrator manages state, enforces the review gate, and ensures no critical gaps are shipped.

## Invocation

```text
/report-analysis-orchestrator $OBJECTIVE | $AUDIENCE | $DELIVERABLE | $CONSTRAINTS
```

## Prerequisites

- Ensure `skills/administrative/agent-team-reporting` is active for context.
- Verify that the constituent commands (`report-analysis-intake`, `report-evidence-gather`, `report-analysis-pass`, `report-draft`, `report-review`) are available.

## Execution Sequence

Execute the following steps sequentially. Pass the output artifacts from each step as context for the next.

1. **Intake**: Run `commands/report-analysis-intake` to normalize the request, define scope, and identify initial constraints.
2. **Evidence Gathering**: Run `commands/report-evidence-gather` to collect and validate the evidence packet. *Stop and hold if critical evidence is missing.*
3. **Analysis**: Run `commands/report-analysis-pass` to synthesize evidence into findings, distinguishing facts from assumptions.
4. **Drafting**: Run `commands/report-draft` to produce the initial report structure based on findings.
5. **Review Gate**: Run `commands/report-review` to apply quality checks. Determine `ship` or `hold` status.

## Workflow Rules

- **Traceability**: Every claim in the final report must link to a source in the evidence packet.
- **Separation of Concerns**: Keep raw facts, analytical reasoning, and final recommendations distinct.
- **Explicit Gaps**: If evidence is insufficient, document the gap clearly in the intake or review stage rather than inferring.
- **Conciseness**: Prioritize decision-ready insights over exhaustive data dumps.
- **Hold Condition**: If the review gate identifies unresolved critical gaps, output a `HOLD` status with specific remediation steps instead of a final report.

## Output Structure

Return the final response in this exact order:

1. **Intake Summary**: Normalized scope, audience, and constraints.
2. **Evidence Packet**: List of sources with confidence levels and coverage notes.
3. **Analysis Findings**: Synthesized insights, clearly separated from raw data.
4. **Final Report**: The polished deliverable, OR a `HOLD` notice with justification.
5. **Action Items**: Unresolved gaps or follow-up tasks required for completion.
