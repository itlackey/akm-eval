---
description: "Notes from converting the Marrowgate map art to CMYK with the DriveThruRPG settings."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-06-30
---
Notes from converting the Marrowgate map art for print. I used ImageMagick with
the CGATS21_CRPC1.icc profile, TIFF with LZW compression at 300 DPI, which is
the DriveThruRPG default. PNG does not store CMYK well, so the output stayed
TIFF. After converting, `identify -verbose` must show Colorspace CMYK and an
embedded profile before the images go into the PDF. Total ink coverage limits
are handled later, at the PDF stage, not in this step.
