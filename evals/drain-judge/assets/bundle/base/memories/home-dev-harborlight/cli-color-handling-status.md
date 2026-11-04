---
description: "Status report on the TTY color stripping rollout for harborlight commands."
evidence: User correction at 10:52:44; applied to moor.ts and unmoor.ts at 10:53:08.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:18:02.755Z
verified:
  - by: human:user
    at: 2026-11-04T01:18:02.755Z
provenance:
  sources:
    - resource: claude:preference-11
---

As of October 14, 2026, the migration to `src/util/tty.ts` is currently in the staging environment. The engineering lead, Sarah Chen, approved the initial phase rollout yesterday. We have successfully deployed the `paint` utility wrapper to 15% of the harborlight command suite. The remaining 85% of commands are still calling `chalk` directly, which poses a risk of color leakage in CI pipelines. The team is prioritizing the core CLI commands first. No commits have been merged to main yet. We are monitoring the `NO_COLOR` compliance metrics closely. If the staging tests pass by November 1st, we will proceed with the beta rollout to the internal developer group. The goal is to have 100% coverage before the Q4 release candidate. Current status: In Progress. Next milestone: Beta environment deployment.
