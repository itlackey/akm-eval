---
description: "ledgerline-export OOM kills on 2026-10-01: three this week, export.pid removed by hand each time."
evidence: "agent's check of journalctl -u ledgerline-export.service around ts=14:32:53"
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

ledgerline-export has been OOM-killed three times this week, the last at 14:30 on 2026-10-01, each time with `--with-attachments`. The stale `var/export.pid` was deleted by hand after each kill. Ops ticket OPS-118 asks for MemoryMax to go from 512 MB to 1 GB; it is not approved yet. Attachment exports are paused until then.
