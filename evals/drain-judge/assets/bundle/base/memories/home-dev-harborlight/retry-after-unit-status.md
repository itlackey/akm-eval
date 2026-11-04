---
description: "Investigation into Pelican API rate-limiting discrepancy"
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

2026-11-04: Incident #8921 regarding sync timeouts persists. Initial hypothesis that the `Retry-After` header was misinterpreted as seconds has been ruled out; logs confirm the value `1500` was correctly parsed as milliseconds, yet the sleep duration remained excessive. We suspected a clock skew issue between our load balancer and Pelican’s edge nodes, but NTP sync checks show <5ms drift. Current focus is on the connection pool implementation. We are testing a patch (commit `a3f9c21`) that forces TCP keep-alives to prevent idle connection resets triggering false 429s. If this fails, we will escalate to Pelican support with raw packet captures to determine if their rate limiter is stateful across connections.
