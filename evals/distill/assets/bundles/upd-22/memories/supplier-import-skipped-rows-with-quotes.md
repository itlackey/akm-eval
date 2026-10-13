---
description: "The supplier import reported success with 212 rows missing; rows with an escaped quote were skipped with only a debug message."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-24
---
The weekly supplier import reported success, but the products table was 212
rows short of the file. Those rows had a double quote inside a quoted field,
written as a backslash and a quote instead of two quotes, and the importer
skipped each one with a message logged only at debug level. Counting rows on
both sides after each import now stops the job when they differ, and the
supplier has been asked to use doubled quotes.
