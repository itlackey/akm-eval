---
type: command
name: generate-report
description: Generate a single QA status report for a publishing project
agent: qa-coordinator
updated: 2026-06-19
---

# QA Status Report Generator

Generate a concise, actionable QA status report for the publishing project located at `$ARGUMENTS`.

## When to use
Use this asset when the QA coordinator needs to synthesize current pipeline health, identify critical blockers, and define immediate next steps for publication readiness.

## Required Skills
Load the following skills dynamically based on project needs:
- pdf-layout-reviewer
- pdf-review
- pdfx-print-pipeline
- cmyk-image-converter

## Report Structure
The output must strictly adhere to the following sections:

### 1. Project Facts
Summarize the core metadata:
- **Trim Size**: Current dimensions.
- **Interior Type**: Specify 'Color' or 'B&W'.
- **Target POD**: Default to DTRPG unless specified otherwise.
- **Page Count**: Total current page count.

### 2. Phase Status
Provide a status indicator for each phase:
- Draft
- Copy
- Layout
- Preflight
- Proof

### 3. Top Blockers
List up to 10 critical blockers, ordered strictly by severity (highest first) and then by effort required.

### 4. Next Actions
Define the top 3 specific actions required to unblock publication immediately.
