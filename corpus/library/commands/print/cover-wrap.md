---
type: command
name: cover-wrap
description: Calculate cover wrap dimensions for POD
agent: qa-coordinator
updated: 2026-06-19
---

# Calculate cover wrap dimensions for POD

Use the `cover-wrap` tool to calculate precise print dimensions including trim, pages, paper size, and bleed.

## When to use
- Use this asset when generating or validating physical book covers that require specific bleed and trim calculations.

## Instructions
1. Invoke `cover-wrap` with required parameters: `trim`, `pages`, `paper`, and `bleed`.
2. Review existing feedback by reading `.reviews/cover-wrap.*.md` before finalizing dimensions.

## Output
- Confirm GO / FIX / NO-GO status based on dimension validation.
- Provide calculated dimensions and recommended next steps.
