---
description: Business metrics (churn, revenue) are reported in Europe/Berlin
  timezone, not UTC.
evidence: User instruction at 16:10:22
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:17:43.970Z
verified:
  - by: human:user
    at: 2026-11-04T01:17:43.970Z
provenance:
  sources:
    - resource: claude:preference-10
---

All business date ranges and financial calculations should be anchored to Europe/Berlin. Queries must explicitly cast timestamps to this timezone to avoid boundary shifts. When querying `customers` or `invoices` tables, always use `timestamptz 'YYYY-MM-DD 00:00 Europe/Berlin'` for date boundaries. This prevents off-by-one errors at day transitions that occur when relying on the database's default UTC interpretation.
