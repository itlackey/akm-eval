---
description: "Status report on the UTF-8 BOM fix for the stock import script."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-16
---

## Stock Import BOM Fix Status

**Date:** November 12, 2026

We are addressing the `KeyError: 'sku'` issue caused by the supplier's UTF-8 BOM. The root cause was identified: `csv.DictReader` with `encoding='utf-8'` preserves the BOM, resulting in a header key of `\ufeffsku` instead of `sku`.

**Progress Checklist:**
- [x] Reproduce the error in staging environment
- [x] Identify BOM as the culprit
- [x] Draft fix using `encoding='utf-8-sig'`
- [ ] Write unit tests for BOM handling
- [ ] Deploy to production

**Current Status:**
The code change is ready in commit `a3f9c21`. We have verified that `utf-8-sig` correctly strips the mark. The next step is to write comprehensive unit tests to ensure no regression occurs with standard UTF-8 files. We aim to merge this by end of week.

**Next Step:**
Write unit tests for the encoding fix.
