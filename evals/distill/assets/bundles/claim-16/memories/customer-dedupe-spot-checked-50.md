---
description: "The dedupe script matched 860 pairs of customer records by email; a hand check of 50 pairs found no false matches."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-10
---
The dedupe script matched 860 pairs of duplicate customer records by normalized
email address. Two people checked 50 of the pairs by hand and found no false
matches in them. The other 810 pairs were merged without a check. Records with
no email address, about 4 percent of the table, were not looked at by the
script at all, so duplicates among them are still in the table.
