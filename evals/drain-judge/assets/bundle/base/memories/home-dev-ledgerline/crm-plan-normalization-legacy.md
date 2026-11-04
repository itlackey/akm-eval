---
description: "Retired legacy CRM plan normalization strategy"
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

Previously, we normalized CRM export plan names by converting them to lowercase and mapping the legacy 'legacy-2019' value to 'starter'. This approach was retired on March 15, 2026, due to maintenance overhead and inconsistency risks. It has been replaced by the Unified Plan Schema (UPS) integration, which enforces standardized casing and mapping at the source system level. This note is kept for historical reference only to document the transition from manual normalization to automated schema enforcement. Teams should no longer implement the legacy lowercase mapping logic in new codebases. Refer to the UPS documentation for current implementation guidelines. This change ensures long-term consistency across Finance dashboards and billing systems without requiring post-export transformations.
