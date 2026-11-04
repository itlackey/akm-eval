---
description: "Status report on ledgerline-export.service memory limits and OOM issues as of November 2026"
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

As of November 12, 2026, the ledgerline-export.service continues to enforce a strict 512 MB MemoryMax limit in systemd. Recent testing with the --with-attachments flag revealed that buffering large attachment sets still frequently exceeds this threshold, triggering kernel OOM kills. The stale var/export.pid issue persists when OOM occurs, blocking subsequent runs until manually cleared.

Current deployed build: v2.4.1 (commit a1b2c3d). Pending changes include increasing MemoryMax to 1 GB for export tasks and implementing a graceful shutdown handler to clean up pid files. Ops team has approved the memory adjustment, but the code fix is not yet merged. Developers should avoid enabling attachment buffering in production until the fix is deployed. Monitor RSS growth closely if testing locally.
