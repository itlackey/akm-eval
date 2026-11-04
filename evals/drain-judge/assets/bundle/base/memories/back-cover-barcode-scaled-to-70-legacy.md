---
description: "Retired approach for handling scaled ISBN barcodes in prepress checks"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-25
---

Previously, our team manually adjusted the blurb position to accommodate scaled EAN-13 barcodes, assuming the vector file remained valid. This heuristic approach was retired on March 15, 2026, due to inconsistent results across different printer specifications. We now use the automated Barcode Integrity Validator (BIV) tool, which strictly enforces the 80% minimum size rule and flags any scaling violations before export. The BIV tool ensures that all barcodes are rendered at nominal size, eliminating the need for manual layout adjustments. This change standardizes our output and prevents scanning failures. The old method is kept here for historical reference only, as it no longer reflects our current quality assurance protocols.
