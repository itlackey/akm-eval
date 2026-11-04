---
description: "Disk alert on ledger-db-02 on 2026-09-16: / at 97%, du accounts for 41 GB of 88 GB used."
evidence: "agent's diagnostic step at 2026-09-16T07:41:34"
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

Disk alert on ledger-db-02, 2026-09-16 07:40: `/` is at 97 percent. `df` shows 88 GB used, `du -sh /` finds 41 GB. `lsof +L1` lists a deleted 46 GB log still open by the export worker (pid 2214). Waiting on ops to approve a restart of the worker in the 09:00 window; until then the alert stays acknowledged.
