---
description: "Status update on disk space discrepancy investigation for ticket OPS-4921."
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

## Status Report: OPS-4921
**Date:** November 14, 2026
**Subject:** Disk full alert on `web-prod-03`

Investigation into the reported 98% usage on `/var/log` revealed a classic case of deleted files held open by processes. `df` showed high usage, while `du` reported only 40% actual file size. 

Identified `nginx` worker processes (PID 8821, 8822) holding open `/var/log/access.log.1` which was deleted on Oct 12. The gap accounts for ~15GB of unreclaimed space.

**Current State:**
- Waiting on Platform Team to approve a rolling restart of the nginx service during the maintenance window.
- PR #4492 is open to add automated truncation logic but is blocked on security review.
- Temporary workaround applied: `truncate -s 0 /proc/8821/fd/3` to reclaim space immediately.

**Next Steps:**
- Monitor disk usage post-restart.
- Follow up with @sarah.ops regarding the security review timeline for PR #4492.

**Commit Reference:** `a1b2c3d` (initial diagnostic script)

*Note: This is a transient status update and will become outdated after the restart.*
