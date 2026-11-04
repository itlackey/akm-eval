---
description: "Rows appended to the bookings sheet with valueInputOption RAW stored dates as text, so the weekly date filter missed them."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-14
---
The bookings form script appends each booking to the Cobble Lane sheet with the
Sheets API `spreadsheets.values.append`. It sent `valueInputOption: RAW`, so a
value such as `2026-09-14` was stored as a text string and not as a date. The
weekly summary filters rows by date, and every row the script had added was
left out of it. Changing the option to `USER_ENTERED` makes Sheets parse the
value as if it were typed, and new rows are now real dates. The 140 rows
already appended had to be converted by hand with a DATEVALUE column.
