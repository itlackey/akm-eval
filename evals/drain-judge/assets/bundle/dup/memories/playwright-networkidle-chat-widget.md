---
description: "An order-history Playwright test timed out on networkidle because a chat widget polls every 20 seconds."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-11
---
The order-history test in the storefront suite timed out on CI at
`page.waitForLoadState('networkidle')`, although the page had fully rendered.
The support chat widget on every page polls its server every 20 seconds, so the
network is never idle for the 500 ms that Playwright waits for, and the wait
only ends at the 30 second test timeout. Replacing the wait with
`await expect(page.getByRole('heading', { name: 'Order history' })).toBeVisible()`
made the test finish in about two seconds, and it has passed on every run
since. The chat widget comes from the shared page layout, so every page built
on that layout has the same problem. The widget itself was not changed.
