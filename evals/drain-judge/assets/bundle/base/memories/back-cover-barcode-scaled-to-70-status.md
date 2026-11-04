---
description: "Status update on Harrowby atlas barcode scaling issue"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-25
---

## Status Report: Harrowby Atlas Back Cover Barcode

**Date:** November 12, 2026
**Ticket:** PR-4921
**Status:** Blocked

The prepress check for the Harrowby atlas back cover is currently stalled. The printer flagged that the EAN-13 barcode was scaled to 70%, violating the 80% minimum spec. 

I pushed a fix in commit `a3f9c21` to restore the barcode to 100% and adjusted the blurb position by +6mm. However, the design lead, Elena, has not yet reviewed the layout changes. She is waiting for final copy approval from the editor before merging. 

Without her sign-off, we cannot regenerate the PDF for the printer. This delay risks missing the November 15th print deadline. Please ping Elena to prioritize this review. The barcode file itself is correct; only the scaling was the issue.

**Next Step:** Awaiting Elena's PR approval.
