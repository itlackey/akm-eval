---
description: "quillmark once added bleed by post-processing PDFs with a pdfjam script, since deleted."
evidence: "Agent's reading of scripts/bleed.sh at 2026-10-09T10:05:30Z."
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

quillmark print output used to go through `scripts/bleed.sh`, which ran pdfjam to enlarge each page by 3 mm and set the boxes after rendering. It was slow on large books and lost the document outline. The script was retired in 2026 and deleted from the repository.
