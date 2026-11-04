---
description: "Retired method for reclaiming disk space from deleted open files using process signals."
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

Prior to 2026, the team relied on sending the `SIGUSR1` signal to application processes to trigger log rotation or file descriptor closure, thereby releasing space held by deleted files. This approach was deemed unreliable because it required specific application support and often led to race conditions or incomplete releases. On March 15, 2026, this method was officially retired due to its fragility and lack of standardization across diverse services. It has been replaced by the `lsof`-based identification and direct truncation via `/proc/<pid>/fd/<fd>` approach, which provides immediate and deterministic space reclamation without depending on application-specific signal handling. This note is retained solely for historical reference to document the evolution of our disk space management strategies.
