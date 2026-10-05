---
type: command
name: check-accessibility
description: Review content at a specified path for WCAG 2.1 AA accessibility
  compliance, identifying issues like missing alt text and heading errors, and
  producing a structured report with concrete fixes.
agent: qa-coordinator
when_to_use: When verifying that markdown, PDF, or TTRPG source files meet WCAG
  2.1 AA standards before build.
updated: 2026-06-19
---

## Purpose
Review the content at `$ARGUMENTS` for accessibility compliance against WCAG 2.1 AA standards.

## Instructions
1. **Inspect the source**: Use the `check-accessibility` tool with the path from `$ARGUMENTS`.
   - This wrapper delegates to `gutterpress validate --phase pre-build --only source.accessibility.* --format json`.
2. **Analyze results**: Read `.reviews/check-accessibility.*.md` to identify specific violations.
3. **Summarize findings**: Focus on:
   - Missing or incorrect alt text.
   - Heading hierarchy issues (e.g., skipped levels).
   - TTRPG-specific concerns: table/stat block readability, map legibility, and ensuring icon meaning is not conveyed by color alone.

## Context & Skills
Load skills as needed to support the analysis:
- `pdf-review` (for visual PDF checks)

## Output Requirements
Write the report to `.reviews/check-accessibility.<timestamp>.md`.

The report must include:
- Issues grouped by severity.
- Precise locations for each issue (file path + heading level or PDF page number).
- Concrete, copy/pasteable fixes where possible.
