---
description: "The invoice-filter test passed alone and failed in the full run until it created its own invoice."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-28
---
The `invoice-filter` test passed alone and failed in the full run. It read an
invoice that the `invoice-create` test had left behind, and in the full run
`invoice-filter` came first. Creating its own invoice inside the test fixed it.
The runner has sorted the test files by name since version 4.2, which is when the
order changed.
