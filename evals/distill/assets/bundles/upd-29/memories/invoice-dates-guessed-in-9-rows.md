---
description: "The extraction model filled in an invoice date in 9 of 120 rows where the scan had none; asking for unknown stopped it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-18
---
A check of the invoice extraction by hand found 9 of the 120 rows with an
invoice date that does not appear on the scan; the model had filled in the
delivery date or the date of the email. The prompt only asked for a date in
each row. Telling the model to write `unknown` when it cannot find the date
made all 9 come back as unknown on the next run, with no change to the other
111.
