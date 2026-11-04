---
description: "Pelican sync rate-limit incident on 2026-09-29: sync stopped, patch to the backoff in review."
evidence: "agent's curl verification at 2026-09-29T15:13:55"
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

Pelican sync, 2026-09-29 15:20: the sync job is stopped after it slept 25 minutes on one 429. The patch that stops multiplying `Retry-After` by 1000 is on branch `fix/pelican-backoff`, commit 4c9e1a7, waiting for review. Vendor support ticket PEL-2291 about their docs is open with no reply. The job will be restarted after the patch is deployed.
