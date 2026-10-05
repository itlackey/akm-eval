---
name: report-review
type: command
description: Run the final review pass on a draft report against its objective
  and evidence, then return a clear ship-or-hold decision.
when_to_use: Use before delivering a report when you need a final quality gate
  for evidence alignment, correctness, and blocking issues.
updated: 2026-05-11
---

# Report Review

Apply the final quality gate before the report is delivered.

## Usage

```
/report-review $DRAFT_REPORT | $OBJECTIVE | $EVIDENCE_PACKET
```

## Task

Use `skills/administrative/agent-team-reporting`, `agents/report-reviewer`, and `assets/review-checklist.md` to review the draft.

Inputs:
- Draft report: `$DRAFT_REPORT`
- Original objective: `$OBJECTIVE`
- Evidence packet: `$EVIDENCE_PACKET`

## Instructions

1. **Align to Objective**: Verify the draft directly answers the `$OBJECTIVE`. Flag any drift or scope creep.
2. **Evidence Audit**: Cross-reference every claim in the draft against `$EVIDENCE_PACKET`. Mark unsupported claims, contradictions, or missing caveats.
3. **Recommendation Check**: Ensure recommendations are feasible, evidence-backed, and aligned with constraints.
4. **Severity Triage**: Categorize issues as `blocking` (must fix before ship) or `polish` (nice-to-have).

## Output Standard

Return a structured review containing:
- **Blocking Issues**: Critical errors, unsupported claims, or objective misalignment.
- **Recommended Fixes**: Actionable steps to resolve blocking issues.
- **Claim Notes**: Specific mapping of claims to evidence (supported/unsupported).
- **Decision**: `SHIP` or `HOLD` with a brief justification.
