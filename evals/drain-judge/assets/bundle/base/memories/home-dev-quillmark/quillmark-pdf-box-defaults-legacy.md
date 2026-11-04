---
description: "Retired quillmark workaround for PDF box defaults"
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

Prior to March 15, 2026, the team relied on a post-processing script to manually inject TrimBox and BleedBox definitions into quillmark-generated PDFs. This approach involved parsing the PDF structure, calculating safe margins based on the CropBox, and rewriting the file metadata to satisfy preflight requirements. While functional, this method introduced significant latency to the build pipeline and created maintenance overhead as PDF specifications evolved. It was officially retired on March 15, 2026, in favor of the native `setTrimBox` and `setBleedBox` API methods provided by quillmark v4.2. This note is retained solely for historical reference to document the legacy workflow and prevent recurrence of the manual injection strategy.
