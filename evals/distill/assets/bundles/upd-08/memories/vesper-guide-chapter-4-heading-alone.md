---
description: "A heading sat alone at the foot of page 62 until headings were set to avoid a break after; the callout box heading still split."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-18
---
In the proof of the Vesper guide, the heading of chapter 4 sat alone at the
bottom of page 62. Setting `break-after: avoid` on headings kept it with its
paragraph. The property has no effect inside a flex container in Paged.js 0.4,
so the heading in the callout box still split.
