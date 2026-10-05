---
type: command
name: compare-pdf
description: Compare two PDFs for regressions by invoking a diff tool.
  evaluating the output against a QA rubric to determine GO, FIX, or NO-GO
  status.
agent: qa-coordinator
updated: 2026-06-19
when_to_use: Use when verifying that a generated document matches the expected
  baseline, specifically looking for unintended changes in content length,
  formatting, or font usage.
---

# Compare two PDFs for regressions

## When to use
Use this command when verifying that a generated document matches the expected baseline, specifically looking for unintended changes in content length, formatting, or font usage.

## Instructions

1. Run the compare script with `pdfA` (baseline) and `pdfB` (candidate):
   ```bash
   bun run skills/print/print-utilities/scripts/compare-pdf.ts <pdfA> <pdfB>
   ```
2. Read the output file `.reviews/compare-pdf.*.md` to inspect the diff report.
3. Summarize any differences that require review, focusing on regressions rather than expected updates.

> **Note**: gutterpress has no PDF-to-PDF diff command; this uses a standalone script (`skills/print/print-utilities`) built on `pdfinfo`/`pdffonts`.

## Output Requirements

- Confirm GO / FIX / NO-GO status based on the diff report.
- Identify specific changes in page count, file size, or font usage.

## QA Rubric

Apply the following checks to the diff report to determine the final status:

1. **Content Integrity**: Verify that no text content has been lost, garbled, or unexpectedly altered between baseline and candidate.
2. **Formatting Consistency**: Check for unintended shifts in margins, line spacing, or alignment that deviate from the baseline style.
3. **Font Usage**: Ensure that font families and weights match the baseline. Flag any substitutions that affect readability or branding.
4. **Page Count**: Confirm the page count matches the baseline unless a content change logically necessitates an addition or removal.
5. **File Size**: Note significant deviations in file size that might indicate embedded bloat or missing resources.

## Decision Logic

- **GO**: No regressions found; all checks pass.
- **FIX**: Minor formatting or font issues detected that do not affect content integrity but require correction.
- **NO-GO**: Content loss, significant formatting breaks, or font substitution issues detected that compromise document quality.
