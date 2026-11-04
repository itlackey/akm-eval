---
description: CRM export plan names have inconsistent casing and include a
  legacy-2019 plan that maps to starter.
evidence: Agent's analysis of plan values at ts=08:48:21 and user instruction at
  ts=08:49:54.
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

The CRM export's plan column contains values like pro , Pro, and legacy-2019. Normalize to lowercase and map legacy-2019 to starter to match Finance's dashboard conventions. This ensures consistent plan-level aggregation across CRM exports and internal billing systems.
