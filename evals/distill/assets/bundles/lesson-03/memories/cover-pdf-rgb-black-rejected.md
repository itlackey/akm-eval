---
description: "The vendor's preflight rejected the Marrowgate cover for RGB content because the title text was RGB black."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-19
---
The print vendor's preflight rejected the Marrowgate rulebook cover with the
message "RGB content found", although every image had already been converted
to CMYK. The cause was the title text: the stylesheet set `color: #000`, and
Chromium writes that into the PDF as RGB black. Changing the value to
`rgb(0 0 0)` made no difference, because it is also RGB. The fix was to
convert the finished PDF with Ghostscript (`-sColorConversionStrategy=CMYK`)
and then run the vendor's preflight again, which passed. The converted file
was 12 MB, down from 41 MB.
