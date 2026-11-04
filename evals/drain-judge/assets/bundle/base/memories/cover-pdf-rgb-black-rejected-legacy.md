---
description: "Retired Ghostscript CMYK conversion workflow for PDF preflight issues"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-19
---

Previously, we resolved RGB content rejections by post-processing the final PDF with Ghostscript. This approach involved running `gs -sColorConversionStrategy=CMYK` to force all elements, including text, into the CMYK color space before submitting to the vendor. While effective, this method was inefficient and increased turnaround time due to the extra processing step and file size reduction artifacts.

On March 15, 2026, this approach was retired. It was replaced by the **Chromium Color Fix** strategy, which addresses the root cause by ensuring the stylesheet explicitly defines CMYK colors or uses device-independent color spaces during the initial PDF generation. This eliminates the need for post-processing and ensures the output is vendor-compliant from the start, preserving file integrity and reducing manual intervention.
