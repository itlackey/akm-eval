---
description: "Investigation into Corbel wiki backup failure on Oct 14, 2026"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-06
---

## Status Report: Corbel Backup Failure
**Date:** October 14, 2026
**Incident ID:** INC-8842

The nightly backup for the Corbel wiki has been failing since October 5th. Initial triage ruled out disk space exhaustion and network connectivity issues to the S3 bucket. Logs indicate `restic` is not found during execution.

We hypothesized a PATH issue similar to past incidents. However, the crontab explicitly sets `PATH=/usr/local/bin:/usr/bin:/bin`. We are now investigating if a recent deployment (commit `a3f9b2c`) altered the binary location or permissions. Next steps include verifying the restic binary path via `which restic` in the cron environment and checking for any SELinux denials. If the binary is missing, we will reinstall it. If permissions are correct, we will trace the cron user's environment variables.

**Action:** Monitor logs for next scheduled run at 02:00 UTC.
