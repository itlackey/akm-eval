---
description: "Storefront CI on 2026-08-10: order-history test timing out at networkidle, quarantined."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-10
---

Storefront suite, 2026-08-10: the order-history test has timed out on CI in 9 of the last 10 runs, at `waitForLoadState('networkidle')`. It is quarantined with `test.fixme` so main stays green. Screenshots show the page fully rendered; the network log is being checked next.
