---
description: "Status update on timezone normalization for due date formatting"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-30
---

As of 2026-10-15, the fix for the `formatDueDate` timezone discrepancy is still pending review. The proposed solution involves setting `TZ=UTC` in the CI environment to align with the test expectations, but the PR #482 is currently blocked by @sarah_dev who is reviewing the impact on other localized components.

The commit `a1b2c3d` addresses the immediate failure where laptops (Europe/Lisbon) and CI (UTC) produced different dates for `2026-09-30T23:30:00Z`. However, we are waiting for confirmation that this change does not break other time-sensitive features in the Europe/Lisbon region. The ticket is assigned to @mike_ops for final approval. We expect to merge by end of week if no regressions are found. Please check PR #482 for the latest diff.
