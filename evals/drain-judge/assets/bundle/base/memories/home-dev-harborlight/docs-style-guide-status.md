---
description: "Status report on harborlight docs localization progress as of late October 2026."
evidence: User's style correction at 2026-09-19T13:38:24Z and follow-up at
  2026-09-19T13:39:03Z
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:16:22.173Z
verified:
  - by: human:user
    at: 2026-11-04T01:16:22.173Z
provenance:
  sources:
    - resource: claude:preference-05
---

As of October 28, 2026, the `harborlight` documentation migration to British English is 65% complete. The core `docs/guide/` directory has been updated to enforce sentence case headings and second-person address. Recent commits, including `a3f9c21`, addressed inconsistencies in the networking module, ensuring CLI flags like `--color` remain untouched while surrounding prose adopts `colour`. 

Pending tasks include the `docs/api/` reference pages, which still contain American spellings. The team is currently blocked on verifying the `licence` vs `license` distinction in the legal section. We aim to merge the final localization branch by November 5. No new style rules have been introduced; the focus remains strictly on the existing mandate to eliminate filler words and standardize spelling across all markdown files.
