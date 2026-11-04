---
description: "Resolving RGB text rejection in PDFs by converting to CMYK via Ghostscript."
---

The publisher's quality check failed the Marrowgate book jacket due to embedded RGB data. Although all visual assets were already in CMYK, the system flagged the title typography. The stylesheet defined the font color as `#000`, which Chromium exports as RGB black. Attempting to use `rgb(0 0 0)` also failed because it remains an RGB definition. To resolve this, the final PDF must be processed using Ghostscript with the flag `-sColorConversionStrategy=CMYK`. After this conversion, re-running the vendor's preflight validation succeeds. Note that this process reduces the file size significantly, dropping from 41 MB to 12 MB.
