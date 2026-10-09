---
description: How a region of the platform fails over to its partner region.
tags: [region, failover]
---

# Regional failover

The North region fails over to the East region. The failover starts after 5 minutes of failed health checks. The traffic shift is done by the DNS weights. The region keeps a standby pool of hosts. The failover drill runs once a year. The runbook is linked from the status page. The region reports its health to the same dashboard. A failover is announced in the incident channel.
