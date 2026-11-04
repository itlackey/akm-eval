---
description: The CRM export's Region column has trailing whitespace and is
  unmaintained; use ledger billing_country instead.
evidence: User correction at ts=08:49:54 and subsequent script edits.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:37.578Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:37.578Z
provenance:
  sources:
    - resource: claude:buried-07
---

The CRM export's Region column contains a trailing space and is not maintained by the CRM team. For accurate regional breakdowns, join the CRM export with the ledger's customers table and use billing_country mapped to regions. This avoids stale or misaligned geographic data from the CRM.
