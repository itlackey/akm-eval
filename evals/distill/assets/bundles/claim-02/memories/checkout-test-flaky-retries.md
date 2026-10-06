---
description: "The checkout-address Playwright test is flaky on small CI runners; retries hide it and the cause is not found."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-04
---
The `checkout-address` Playwright test failed about one run in five on the
two-vCPU CI runners, but never on a developer machine. Adding
`test.describe.configure({ retries: 2 })` to its file made it pass 20 runs in
a row. The cause was not found. The best guess is that the address form's
autocomplete request is slower on the small runners, but that is untested.
The retries only hide the failures, so the test is marked `@flaky` in the
tracker issue until someone investigates. No other test file was changed.
