---
description: "Status update on PR #402 regarding the bookings sheet date parsing issue."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-14
---

## Status Report: PR #402 - Fix Date Parsing in Bookings Script

**Date:** October 14, 2026

The pull request addressing the RAW value input issue in the Cobble Lane sheet is currently blocked. I pushed commit `a3f9c21` to switch `valueInputOption` to `USER_ENTERED`, which correctly parses dates like `2026-09-14` as native date objects rather than text strings.

However, the migration script for the 140 existing rows is failing in the staging environment due to a timezone mismatch in the `DATEVALUE` function. I have pinged @sarah_devops to review the timezone configuration in the Apps Script project settings. We are waiting for her approval on the migration logic before merging. Once she confirms the timezone handling, we can proceed with the bulk update and close the ticket.

**Next Steps:**
1. Await Sarah's review.
2. Test migration on staging.
3. Merge and deploy.
