---
description: "Open CSV files from spreadsheet programs with utf-8-sig to drop the byte order mark."
---

A supplier CSV saved by a spreadsheet program starts with a UTF-8 BOM. Opened with `encoding='utf-8'`, `csv.DictReader` keeps it in the first header, so the column is `\ufeffsku` and `row['sku']` raises `KeyError`. `encoding='utf-8-sig'` strips the mark. Only the first column is affected.
