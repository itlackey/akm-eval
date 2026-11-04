---
description: "CRM plan clean-up on 2026-10-06: 412 rows still legacy-2019 after lowercasing; the mapping is not in the script yet."
evidence: "Agent's count of plan values at ts=08:52:10."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:37.607Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:37.607Z
provenance:
  sources:
    - resource: claude:buried-07
---

Ledgerline CRM export, run of 2026-10-06: after lowercasing the plan column, 412 rows are still `legacy-2019`, and the script does not map them yet. Finance's dashboard shows those customers under an empty plan. The mapping to `starter` is written but sits in an uncommitted change; it goes in with the next export run on Monday.
