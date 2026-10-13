---
description: Stable convention for end-to-end test selectors.
updated: 2026-04-28
---

End-to-end tests locate elements only by their `data-testid` attribute, never
by CSS class or visible text, so styling and copy changes do not break them.
The convention covers every end-to-end suite in the repository and has not
changed since the suites were written.
