---
description: "A small embedding model matched the large one's top three help-centre results for 18 of 20 English queries."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-08
---
For the help-centre search, the small embedding model `mini-embed` returned the
same top three articles as the large model for 18 of 20 test queries, and
answered in about half the time. All 20 queries were in English. The help
centre also has German and Portuguese articles, and no query in those languages
was tried. In the two queries where the results differed, the small model
ranked an older version of the article first.
