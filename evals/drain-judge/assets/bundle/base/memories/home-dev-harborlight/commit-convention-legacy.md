---
description: "harborlight's former commit style: free-form subjects with the ticket in brackets."
evidence: "User's instruction at 2026-09-23T13:23:30.000Z, which named the old style it replaces."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:11:21.156Z
verified:
  - by: human:user
    at: 2026-11-04T01:11:21.156Z
provenance:
  sources:
    - resource: claude:preference-01
---

Until September 2026 harborlight commits had free-form subjects with the ticket number in square brackets at the start, such as `[HBL-402] Fixed mooring timeout.`, and no footer. Capitals and trailing periods were common. The style was dropped when the project moved to conventional commits, and the changelog script that parsed the bracket prefix was removed.
