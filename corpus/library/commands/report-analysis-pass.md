---
name: report-analysis-pass
type: command
description: Convert an evidence packet into findings, tradeoffs, risks, and a
  recommendation.
when_to_use: Use when you already have an evidence packet and need a structured
  analysis with explicit risks, tradeoffs, and conclusions.
updated: 2026-05-11
---

# Report Analysis Pass

Convert the evidence packet into a decision-ready analysis with explicit findings, separated inference vs. confirmed facts, risks, tradeoffs, and a recommended next step.

## Usage

```text
/report-analysis-pass $EVIDENCE_PACKET | $DECISION_CRITERIA | $CONSTRAINTS
```

## Task

Use `skills/administrative/agent-team-reporting` and `agents/report-analyst` to synthesize the evidence into a structured output.

### Inputs
- **Evidence packet**: `$EVIDENCE_PACKET` (raw data, logs, or reports)
- **Decision criteria**: `$DECISION_CRITERIA` (goals, constraints, success metrics)
- **Constraints**: `$CONSTRAINTS` (budget, time, regulatory limits)

## What this command does

1.  **Extracts decision-relevant findings**: Identifies the core facts directly impacting the decision.
2.  **Separates evidence from inference**: Clearly distinguishes what is confirmed by data (`Fact`) from what is hypothesized or inferred (`Inference`).
3.  **Compares options**: Evaluates available paths against consistent criteria when multiple solutions exist.
4.  **Surfaces critical factors**: Explicitly lists tradeoffs, risks, dependencies, and potential failure modes.
5.  **Produces a recommendation**: Delivers a clear next step with explicit rationale and highlights remaining gaps or uncertainties.

## Output Standard

Return the analysis in the following structure:
- **Key Findings**: Summary of confirmed facts.
- **Interpretation & Implications**: What these facts mean for the decision context.
- **Option Tradeoffs**: Comparison of available paths (Pros/Cons).
- **Risks and Gaps**: Potential pitfalls, unknowns, and dependencies.
- **Recommendation**: The proposed action with a concise rationale.
