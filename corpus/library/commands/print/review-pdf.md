---
type: command
name: review-pdf
description: Page-by-page PDF layout review with actionable fixes
agent: print-layout-reviewer
when_to_use: Use this asset to evaluate the visual design, typography, and
  TTRPG-specific layout quality of a PDF before final printing.
updated: 2026-06-19
---

Review the PDF at `$ARGUMENTS` for layout/design quality and POD readiness.

**This is a VISUAL review** - it evaluates design and layout quality:
- Typography and spacing
- Margins and safe zones
- Image quality and placement
- Consistency and readability
- TTRPG-specific layout (stat blocks, tables, sidebars)

For TECHNICAL preflight (PDF/X, fonts, TAC), use `commands/print/preflight-print` instead.

Load skills as needed:
- pdf-layout-reviewer
- pdf-review

Output:
- Write `.reviews/dc.review-pdf.<timestamp>.md`
- Start with GO / FIX / NO-GO
- Prefer pattern-level fixes; include page callouts only for blockers/representative pages.
- For each issue: `p.<n> | severity | issue | why | fix`
