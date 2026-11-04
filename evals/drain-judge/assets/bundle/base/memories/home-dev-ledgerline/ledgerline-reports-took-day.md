---
description: "Ledgerline reports took day and month boundaries in UTC until October 2026."
evidence: "User instruction at 16:10:22, replacing the earlier convention."
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

Ledgerline's reporting queries used to take day and month boundaries in UTC, written as `date_trunc('month', created_at)` on the raw timestamps, and the dashboards labelled figures as UTC. That convention was retired in October 2026 when business reporting moved to Berlin time.
