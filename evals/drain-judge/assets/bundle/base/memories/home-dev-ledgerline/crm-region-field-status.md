---
description: "Ledgerline region report on 2026-10-06: billing_country join done for invoices, customers report still on CRM Region."
evidence: "Agent's script edit at ts=08:55:40."
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

Region work, 2026-10-06. The invoices report now joins the ledger's customers table and maps billing_country to regions. The customers report still reads the CRM Region column and shows 37 accounts under "EMEA " with a trailing space. Switching it over is next; the branch is `region-from-ledger`.
