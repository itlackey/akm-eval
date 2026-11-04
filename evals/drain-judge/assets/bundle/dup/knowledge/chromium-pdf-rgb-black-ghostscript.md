---
description: "Chromium writes CSS black as RGB; convert the PDF with Ghostscript for CMYK preflight."
---

A print PDF from Chromium carries RGB wherever the CSS sets a colour, `color: #000` included, and `rgb(0 0 0)` is no better; vendor preflight then fails with "RGB content found". Converting the final PDF with Ghostscript and `-sColorConversionStrategy=CMYK` passes it (and cut the Marrowgate cover from 41 MB to 12 MB).
