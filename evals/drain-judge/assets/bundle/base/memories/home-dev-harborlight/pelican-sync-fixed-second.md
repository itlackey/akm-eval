---
description: "Pelican sync once used a fixed 60-second sleep on every 429, before it read Retry-After."
evidence: "agent's reading of the old backoff code at 2026-09-29T15:10:41"
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

The first Pelican sync job ignored `Retry-After` and slept a fixed 60 seconds on every 429, retrying up to five times before failing the run. That backoff was retired in 2026 when the job switched to reading the header; the constant `PELICAN_RETRY_SLEEP` and its retry loop were deleted.
