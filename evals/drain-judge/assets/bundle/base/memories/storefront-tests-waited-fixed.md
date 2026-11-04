---
description: "The storefront tests once waited with fixed page.waitForTimeout sleeps."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-11
---

The first storefront tests waited for pages with fixed sleeps, `page.waitForTimeout(5000)` after each navigation, which made the suite take 40 minutes. The sleeps were removed in 2026 when the tests switched to waiting on load states.
