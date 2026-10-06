---
description: "Reminders for the next book build with Paged.js: version first, supported break-inside values, handlers."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-01
---
Reminders for the next Paged.js book build. Record the exact Paged.js version
and the rendering path before diagnosing a layout problem. Version 0.4.3
supports `break-inside: avoid` but not `avoid-page`, and an oversized element
must still be allowed to split. A `data-break-inside` attribute does nothing
unless the pipeline registers a handler for it. Check left and right page
placement in the rendered output, because front matter and blank pages shift the
spread; a class name alone proves nothing.
