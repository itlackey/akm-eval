---
description: "Don't wait on networkidle in pages with a polling widget; wait for a visible element."
---

`page.waitForLoadState('networkidle')` never resolves on storefront pages: the shared layout's support chat polls every 20 seconds, so the network is never idle for 500 ms and the wait runs to the 30 s timeout. Wait for content instead, e.g. `expect(page.getByRole('heading', { name: 'Order history' })).toBeVisible()`.
