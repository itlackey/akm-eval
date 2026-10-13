---
description: "The October newsletter showed a raw first_name placeholder to 312 readers because their list column was headed First Name."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-05
---
The October newsletter of the Larkspur reading club went out with the greeting
`Hello {{first_name}},` printed as is to 312 readers. Those 312 had been
imported from a second spreadsheet whose column was headed `First Name`. The
mailing tool matches merge fields to column names exactly, so `first_name` did
not match `First Name` and the placeholder was left in. Renaming the column to
`first_name` and importing the list again fixed the November issue. The tool's
preview shows the first contact only, which came from the other spreadsheet, so
the preview looked right.
