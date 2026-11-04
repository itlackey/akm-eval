---
description: "In quillmark, set TrimBox and BleedBox yourself for print PDFs."
---

If a quillmark PDF does not set TrimBox and BleedBox, both come out equal to the CropBox. Print preflight then reports "TrimBox not set or equal to MediaBox" and rejects pages with content at the edge. For any print output, call the TrimBox and BleedBox setters explicitly.
