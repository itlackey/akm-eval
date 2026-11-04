---
description: "Append with valueInputOption USER_ENTERED so dates are stored as dates."
---

With `valueInputOption: RAW`, `spreadsheets.values.append` stores `2026-09-14` as text, not a date, so date filters skip it; the Cobble Lane weekly summary left out every row the script added. `USER_ENTERED` parses values as if typed. Rows already stored as text need converting, e.g. with DATEVALUE.
