---
description: quillmark's PDF writer defaults BleedBox and TrimBox to CropBox
  when not explicitly set, causing print preflight failures.
evidence: Initial `pdfinfo` output showing all boxes equal, and agent's
  diagnosis before implementing the fix.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:15:04.100Z
verified:
  - by: human:user
    at: 2026-11-04T01:15:04.100Z
provenance:
  sources:
    - resource: claude:insight-17
---

When using quillmark to generate PDFs, omitting explicit TrimBox and BleedBox calls results in all boxes equaling the CropBox. Print preflight tools flag this as "TrimBox not set or equal to MediaBox" and reject files with edge-touching content. Always set TrimBox and BleedBox explicitly when print output is required.
