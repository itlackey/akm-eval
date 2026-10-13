---
description: "The weekly stock import raised KeyError on sku because the supplier CSV starts with a UTF-8 byte order mark."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-16
---
The weekly stock import failed with `KeyError: 'sku'` on the first row,
although the file plainly has a sku column. The supplier exports the file from
a spreadsheet program that writes a UTF-8 byte order mark (BOM) at the start of
the file. The script opened it with `encoding='utf-8'` and read it with
`csv.DictReader`, which kept the mark as part of the first header, so the
column was named `\ufeffsku` and not `sku`. Opening the file with
`encoding='utf-8-sig'` drops the mark, and the import has run cleanly for three
weeks since. Only the first column was affected.
