---
description: "Weekly stock import on 2026-07-15: failing with KeyError on sku, stock not updated."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-15
---

Stock import, 2026-07-15: the weekly run failed on the first row with `KeyError: 'sku'`, so stock levels on the shop are a week old. The supplier's file looks normal in a spreadsheet. The supplier has been asked whether their export changed; prices are updated by hand meanwhile.
