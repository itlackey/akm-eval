---
description: "quillmark print PDF on 2026-10-09: TrimBox fix done for the cover, interior pages still fail preflight."
evidence: "pdfinfo output for the interior file at 2026-10-09T10:12:44Z."
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

Print job for the Harbour Lights book, 2026-10-09: the cover PDF now sets TrimBox and BleedBox and passes the printer's preflight. The interior file still fails with "TrimBox not set or equal to MediaBox" on 212 pages, because the page template does not call the box setters yet. Resubmission to the printer is planned for Friday.
