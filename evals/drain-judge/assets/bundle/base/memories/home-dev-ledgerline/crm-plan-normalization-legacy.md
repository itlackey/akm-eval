---
description: "Ledgerline once kept a hand-edited plan_aliases.csv for CRM plan names."
evidence: "User instruction at ts=08:49:54, which replaced the alias file."
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

Ledgerline used to clean CRM plan names with `plan_aliases.csv`, a lookup file that a finance analyst edited by hand whenever a new spelling appeared. Rows with no alias were dropped from the plan report. The file was retired in October 2026 and the lookup moved into the export script.
