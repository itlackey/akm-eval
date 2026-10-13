---
description: "A screen reader announced the setup guide's diagram as img_4471.png because it had no alt text; the docs build now checks for it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-20
---
A reader who uses a screen reader reported that the network diagram in the
setup guide was announced as img_4471.png and nothing else. The image had no
alt text, so the screen reader fell back to the file name. Since version 2.1
the docs build can fail on an image without alt text; the check was switched
on, and it found 37 more images on other pages.
