---
description: "The tracker export dropped the owners column for tickets with two assignees; the export now joins them."
source: "session:tracker-export-fix"
observed_at: "2026-10-15"
confidence: 0.95
tags:
  - tracker
  - export
type: memory
---
The tracker export left the owners column empty for any ticket with two
assignees. The export took only the first assignee field and skipped the row
when it held a list. It now joins the assignees with a semicolon, and the
export of 212 tickets had no empty owners column.
