---
description: "A sort moved the stock sheet's header to row 48 and broke the reorder script; the sort had been done by the sheet's owner."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-04
---
Someone sorted the whole stock sheet by quantity, header row included, and the
header ended up on row 48. The reorder script reads columns by name from row 1,
so it stopped. Freezing row 1 keeps it out of a sort, and the row is now also
protected. A protected range still lets the sheet's owner and editors listed on
the range change it, and the sort had been done by the owner.
