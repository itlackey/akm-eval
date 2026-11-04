---
description: "Retired legacy CRM region mapping approach"
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

Previously, we relied on the CRM export's Region column for geographic segmentation. This approach was officially retired on March 15, 2026, due to persistent data integrity issues. The column contained trailing whitespace that caused inconsistent joins and was never maintained by the CRM team, leading to stale or misaligned geographic data. 

To resolve this, the team adopted the Ledger Billing Country approach. We now join the CRM export with the ledger's customers table and use the billing_country field, which is mapped to regions. This ensures accurate regional breakdowns by leveraging a maintained, reliable source of truth. This note is kept for historical reference only to document the migration path and prevent reversion to the flawed CRM-based method.
