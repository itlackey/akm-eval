---
description: A large gap between `df` used space and `du` reported space on a
  filesystem indicates deleted files are still held open by running processes.
evidence: agent's diagnostic step at 2026-09-16T07:41:34 and lsof command at
  2026-09-16T07:41:36
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

When investigating sudden disk full alerts, always compare `df` and `du` outputs. If `df` shows high usage but `du` reports significantly less, the missing space is almost certainly allocated to deleted files that active processes still have open. Use `sudo lsof +L1 /path/to/mount` to identify the offending processes and files. Restarting the service or truncating the file via `/proc/<pid>/fd/<fd>` will reclaim the space.
