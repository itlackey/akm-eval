---
type: command
name: preflight-print
description: Deterministic preflight check for interior PDFs targeting
  DriveThruRPG POD standards, verifying PDF/X compliance, font embedding, TAC
  limits, page count, and encryption status.
agent: qa-coordinator
when_to_use: When verifying technical print readiness of a PDF before
  DriveThruRPG submission.
updated: 2026-06-19
---

# Preflight an interior PDF for POD (DriveThruRPG-first)

**This is a DETERMINISTIC check** - it verifies technical requirements only:
- PDF/X compliance
- Font embedding
- Total Area Coverage (TAC/ink limits)
- Page count / signature alignment
- Encryption status

## Instructions

1. Run gutterpress preflight against the PDF path from the arguments:
   ```bash
   gutterpress preflight --pdf <pdf-path> --target dtrpg --report-dir .reviews --name preflight-print.<timestamp>
   ```
   Thresholds and required checks come from the manifest's `preset`/`targets`, not from flags on this command.

2. Read the generated report from `.reviews/preflight-print.*.md` (and the sibling `.json`).

3. Interpret the results:
   - Explain what each error/warning means and why it matters for print.
   - If trim size wasn't provided but would help, suggest re-running with it.

4. Apply TAC measurement caution when discussing ink limits:
   - Do **not** treat ImageMagick per-channel maxima as per-pixel TAC. Channel maxima can come from different pixels and overstate or misstate the real TAC.
   - TAC must be computed **per pixel** by summing the raw `C + M + Y + K` sample values for the same pixel, then converting that sum to a percentage of total possible coverage.
   - gutterpress itself measures TAC via Ghostscript's `inkcov` device — a
     page/image-level CMYK sum, not a per-pixel check — see
     `skills/print/pdfx-print-pipeline` for how it's configured and what it
     covers.

For VISUAL review (layout, design, quality), use `commands/print/compare-pdf` or the pdf-review skill instead.

For the gutterpress PDF/X build and preflight workflow, refer to `skills/print/pdfx-print-pipeline`.

## Output

- Confirm GO / FIX / NO-GO status.
- Provide the smallest set of changes that resolves blockers.
- If FIX or NO-GO, explain exactly what needs to change in the source/build.
