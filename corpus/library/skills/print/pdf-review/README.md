---
description: A quick reference for running human-style visual QA passes on
  interior PDFs for POD readiness.
updated: 2026-06-19
---

# PDF Review (Quick Usage)

Use this for a fast reminder of how to run a human-style visual QA pass.

## When to use
- Use when you need a rapid, high-level assessment of a PDF's interior content for Print-on-Demand (POD) readiness.
- Ideal for initial triage before deep technical validation or automated layout analysis.

## Best paired with
- `skills/print/pdfx-print-pipeline/SKILL.md` (PDF/X + technical validation)
- `skills/print/pdf-layout-reviewer/SKILL.md` (automated heuristics + selective deep review)

## What to ask for
- "Review this interior PDF for POD readiness (DriveThruRPG). Give GO/FIX/NO-GO and page-numbered fixes."

## Expected output
- **GO/FIX/NO-GO**: Clear binary decision or conditional approval.
- **Blockers first**: Critical issues preventing immediate printing.
- **Pattern-level fixes**: Generalizable corrections for recurring problems.
- **Page callouts**: `p.<n> | severity | issue | fix` format for specific locations.
