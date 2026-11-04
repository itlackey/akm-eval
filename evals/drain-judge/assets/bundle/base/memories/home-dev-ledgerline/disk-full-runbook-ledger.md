---
description: "The old disk-full runbook for ledger hosts, which said to delete the largest logs found by du."
evidence: "agent's reading of runbooks/disk-full.md at 2026-09-16T07:39:50"
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:12:51.122Z
verified:
  - by: human:user
    at: 2026-11-04T01:12:51.122Z
provenance:
  sources:
    - resource: claude:insight-07
---

The ledger hosts' disk-full runbook used to say: run `du -ah /var/log | sort -h | tail`, delete the largest log files, and rerun `df`. It did not mention files held open by running processes. The runbook was replaced in September 2026, and `runbooks/disk-full.md` now only points to the new one.
