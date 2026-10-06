---
description: "Footnotes overflowed the page in the Paged.js build of the rulebook, and the fix was checked on one layout."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-04-02
---
While building the rulebook PDF with Paged.js, long footnotes on page 14 ran
past the bottom margin and the last line was clipped. The cause was a
`break-inside: avoid` rule on the footnote area that also applied to the
call-out boxes. Removing it from `.footnote-area` fixed page 14 and left the
call-out boxes intact. The fix was verified only on the rulebook, which uses
the single-column layout. The two-column supplement was not rebuilt, so it is
not known whether it has the same problem.
