---
description: "Status update on Windows CRLF deployment failure fix"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-09
---

## Status Report: Deploy Script Line Ending Issue

**Date:** November 12, 2026
**Ticket:** DEPLOY-492
**Status:** Blocked

The initial fix for the `bad interpreter` error on Windows build agents is currently pending review. The proposed solution involves adding `*.sh text eol=lf` to `.gitattributes` to enforce LF line endings during checkout.

**Current State:**
- PR #8821 is open with the `.gitattributes` change.
- Commit `a3f9b2c` implements the attribute rule.
- Waiting on @sarah-ops to approve the change before merging.

**Impact:**
Until merged, the packaging job continues to fail on Windows agents due to CRLF conversion by Git. This blocks the release pipeline for v2.4.0.

**Next Steps:**
- Follow up with @sarah-ops for approval.
- Verify the fix on a staging build after merge.

*Note: This is a temporary status update and may become outdated quickly.*
