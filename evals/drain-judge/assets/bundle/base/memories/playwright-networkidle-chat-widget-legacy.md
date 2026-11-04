---
description: "Retired approach for handling chat widget polling in Playwright tests"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-11
---

Prior to March 15, 2026, the team relied on `page.waitForLoadState('networkidle')` to ensure full page hydration in the storefront suite. This approach proved fragile because the persistent support chat widget, present on all shared layout pages, polled its backend every 20 seconds. Consequently, the network never achieved the required idle state, causing consistent timeouts at the 30-second limit despite the DOM being fully rendered.

This method was retired on March 15, 2026, in favor of the `waitForSelector` approach. The new strategy explicitly waits for the target heading to become visible, bypassing the network state entirely. This change reduced test execution time from 30 seconds to approximately two seconds and eliminated flakiness caused by external widget polling. This note is retained for historical context only.
