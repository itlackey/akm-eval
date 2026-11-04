---
description: "Status update on migrating Northgate invoice archive to cloud storage"
tags: [finance, archive]
---

## Status Report: Northgate Archive Migration

**Date:** November 12, 2026
**Ticket:** ENG-4921
**Assignee:** @jdoe

The migration of the Northgate supplier invoice archive from the legacy tape-backed share to the new cloud bucket is currently blocked. We have completed the initial data ingestion for 85% of the supplier records, but the process stalled on the Q3 2024 batch due to permission errors.

The issue is waiting on approval from the Finance Compliance team to grant read access to the new service account. Without this, we cannot verify the integrity of the encrypted files before cutover. 

Commit `a1b2c3d` attempted to bypass the check but was reverted. We are expecting a response from @sarah_finance by end of day tomorrow. If not resolved, the sprint goal for archive accessibility will be missed. Please ping the compliance lead directly.

**Next Steps:**
- Follow up with Finance Compliance
- Re-run ingestion script upon approval
- Update documentation with new access paths
