---
description: "Supplier stock files once came as XLS workbooks read with xlrd."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-16
---

The supplier used to send stock as an XLS workbook, read by the import with `xlrd` from the sheet named Stock. When the supplier changed systems in 2026 they switched to CSV, and the xlrd reader was removed from the import.
