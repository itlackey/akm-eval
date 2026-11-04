---
description: "Retired note on the stale PID file workaround for ledgerline-export OOM kills"
evidence: agent's check of systemctl show ledgerline-export.service -p MemoryMax
  and kernel OOM logs around ts=14:32:53
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

## Retired Approach: PID File Cleanup Workaround

**Status:** RETIRED on 2026-03-15

Previously, developers manually deleted `var/export.pid` after an OOM kill to unblock future runs. This was a fragile hack because the trap failure meant the file persisted indefinitely, causing silent failures for subsequent exports.

**Why it was retired:**
1. It required manual intervention, leading to operational debt.
2. It masked the root cause (memory limits) rather than fixing it.
3. It risked data corruption if the process was actually still running.

**Replacement:**
We now use the `ledgerline-export.service` systemd unit with a dynamic `MemoryMax` limit. The service is configured to restart automatically on failure, and the PID file is managed by systemd's `PIDFile=` directive, ensuring atomic cleanup. Developers should monitor RSS growth and coordinate with ops to adjust limits instead of manually deleting files.
