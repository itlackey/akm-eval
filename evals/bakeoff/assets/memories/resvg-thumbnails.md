---
description: How the thumbnail job renders SVG with resvg.
updated: 2026-06-09
---

The thumbnail job renders SVG with `resvg --skip-system-fonts --use-fonts-dir assets/fonts --dpi 192`, so the output does not depend on the fonts installed on the runner. Text that needs a font missing from `assets/fonts` renders in the fallback font, and the job fails the build when the result differs from the golden PNG by more than 0.5 percent.
