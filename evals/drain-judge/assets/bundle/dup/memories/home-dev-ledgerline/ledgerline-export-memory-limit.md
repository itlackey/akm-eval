---
description: The ledgerline-export.service systemd unit enforces a 512 MB MemoryMax limit.
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

Running the export with the --with-attachments flag buffers attachments in memory, which can easily exceed the 512 MB limit and trigger a kernel OOM kill. When OOM kills the process, the shell's EXIT trap is skipped, leaving a stale var/export.pid file that blocks all future runs. Developers should monitor RSS growth when enabling attachment buffering and coordinate with ops to adjust the systemd memory limit if legitimate workloads require more RAM.
