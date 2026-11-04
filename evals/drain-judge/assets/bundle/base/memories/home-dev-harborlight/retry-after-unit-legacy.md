---
description: "Retired approach for handling Pelican API rate limits using seconds conversion"
evidence: agent's curl verification at 2026-09-29T15:13:55 and realization at
  2026-09-29T15:14:04
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:10:41.725Z
verified:
  - by: human:user
    at: 2026-11-04T01:10:41.725Z
provenance:
  sources:
    - resource: claude:insight-04
---

## Retired: Pelican API Retry-After Seconds Conversion

**Status:** Retired on 2026-03-15
**Replaced by:** Empirical Header Verification

Previously, our sync jobs assumed the Pelican API's `Retry-After` header adhered strictly to its documentation, treating values as seconds. This assumption led to catastrophic delays; for instance, a `1500` value was interpreted as 1500 seconds (25 minutes) instead of the actual 1.5 seconds. This bug caused significant downtime during high-load periods.

On March 15, 2026, we retired this hardcoded conversion logic. The team now implements a fallback mechanism that empirically verifies header units by comparing API response times against the header value during initial connection phases. This note is retained solely for historical context to prevent recurrence of the 25-minute sleep bug. Always validate vendor headers against live responses rather than trusting stale documentation.
