---
name: report-draft
type: command
description: Turn a completed analysis packet into a decision-ready report draft
  using the standard reporting template.
when_to_use: Use when analysis is complete and you need to turn it into a
  concise draft tailored to a target audience and style.
updated: 2026-05-11
---

# Report Draft

Transform the provided analysis packet into a concise, decision-ready report draft. Tailor the narrative, depth, and tone to the specified audience while strictly adhering to the standard reporting template and style constraints.

## Prerequisites

Before drafting, inspect the following assets to ensure consistency:
- `skills/administrative/agent-team-reporting`: For reporting standards and tone guidelines.
- `agents/report-writer`: For persona-specific writing conventions.
- `assets/report-template.md`: The structural skeleton for the output.

## Inputs

- **Analysis Packet** (`$ANALYSIS_PACKET`): The raw findings, data, and context to be synthesized.
- **Audience** (`$AUDIENCE`): The target reader (e.g., executives, technical team, stakeholders).
- **Style Constraints** (`$STYLE`): Specific tone, length, or formatting requirements.

## Instructions

1. **Structure**: Follow the sections defined in `assets/report-template.md` exactly.
2. **Lead with Value**: Start with the executive takeaways and key answer. Do not bury the lead.
3. **Synthesize, Don't Summarize**: Convert raw analysis into actionable insights. Highlight risks, gaps, and recommendations clearly.
4. **Traceability**: Ensure every key claim or recommendation is backed by evidence from the analysis packet. Explicitly state assumptions where data is missing.
5. **Audience Adaptation**: Adjust the technical depth and vocabulary based on `$AUDIENCE` and `$STYLE`.

## Output Requirements

Return the final report draft in markdown format. It must include:
- **Objective and Scope**: Briefly define what the report covers.
- **Executive Takeaways**: The 3-5 most critical points for decision-making.
- **Key Findings**: Detailed observations derived from the analysis.
- **Options/Recommendations**: Actionable paths forward with pros/cons.
- **Risks and Gaps**: Unresolved issues or data limitations.
- **Sources**: Reference the inputs used.
- **Next Steps**: Immediate actions required.

Do not include meta-commentary or explanations of your process. Output only the report draft.
