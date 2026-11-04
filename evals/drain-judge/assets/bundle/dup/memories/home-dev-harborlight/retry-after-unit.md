---
description: Pelican API's Retry-After header is in milliseconds, contradicting
  its own documentation.
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

When syncing with the Pelican API, always treat the `Retry-After` header value as milliseconds. The official vendor documentation incorrectly claims it is in seconds. During debugging, a `retry-after: 1500` header actually corresponded to a ~2-second rate limit window. The previous implementation multiplied this value by 1000, causing the sync job to sleep for 25 minutes on a single 429 response. Future sessions should verify vendor header units empirically rather than trusting stale docs.
