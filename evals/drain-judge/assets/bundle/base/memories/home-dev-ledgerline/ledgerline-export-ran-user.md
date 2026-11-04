---
description: "ledgerline-export once ran from a user crontab with no memory limit, before the systemd unit."
evidence: "agent's look at the old crontab around ts=14:30:12"
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:10:00.385Z
verified:
  - by: human:user
    at: 2026-11-04T01:10:00.385Z
provenance:
  sources:
    - resource: claude:insight-01
---

Before the systemd unit, ledgerline-export ran from the deploy user's crontab at 02:00 with no memory limit, and its output went to `~/export.log`. A run that grew too large slowed the whole host instead of being killed. The crontab entry was removed in 2026 when `ledgerline-export.service` replaced it.
