---
description: "The daily orders report counted 214 orders twice on the night the clocks went back, because orders were stored in local time."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-30
---
The daily orders report for 2025-10-26 counted 214 orders twice. The orders
table stored local Lisbon time, and when the clocks went back that night the
hour from 01:00 to 02:00 came round twice, so the report, which selects orders
hour by hour in local time, read the same 214 orders for both 01:00 hours.
Since the timestamps are stored in UTC the report has been right; the 2025
figures were corrected by hand.
