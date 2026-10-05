---
name: report-evidence-gather
type: command
description: Gather a reusable evidence packet with source traceability.
  contradictions, and unresolved questions before analysis begins.
when_to_use: Use when a report or investigation needs source-backed evidence
  collected before interpretation or recommendation.
updated: 2026-05-11
---

# Report Evidence Gather

Build a source-backed evidence packet that can be handed directly to analysis without re-collecting the source material.

## Usage

```
/report-evidence-gather $OBJECTIVE | $SCOPE | $SOURCES | $OPEN_QUESTIONS
```

## Inputs

- **Objective**: $OBJECTIVE
- **Scope**: $SCOPE
- **Preferred sources**: $SOURCES
- **Open questions**: $OPEN_QUESTIONS

## Instructions

1. **Inspect Context**: Review `skills/administrative/agent-team-reporting`, `agents/report-researcher`, and `assets/evidence-log-template.md` to align with reporting standards.
2. **Collect Facts**: Gather relevant facts, examples, constraints, and source material matching the $OBJECTIVE and $SCOPE.
3. **Trace Provenance**: For each key claim, record the source, timestamp, and context. Ensure traceability.
4. **Identify Gaps**: Log contradictions, missing information, and weak evidence. Do not interpret; just flag.
5. **Separate Concerns**: Clearly distinguish raw evidence from any interpretation or recommendation.
6. **Format Output**: Produce a reusable evidence packet using the structure below.

## Output Standard

Return the following sections:

### Evidence Log
- Structured list of verified facts with source citations.

### Source List
- Detailed traceability notes for each source used.

### Contradictions and Gaps
- Explicit list of conflicting data points or missing information.

### Open Questions
- Unresolved questions that require further investigation or clarification.

## Constraints

- **No Interpretation**: Do not draw conclusions or make recommendations. Stick to observable evidence.
- **Explicit Gaps**: If information is missing, state it explicitly rather than inferring.
- **Source Integrity**: Ensure all sources are credible and properly cited.
