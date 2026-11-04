---
description: "The web client's nightly job that committed refreshed snapshots back to main."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-03
---

Until September 2026 a nightly job in the web client repository ran the tests with `jest -u` and committed any rewritten snapshots back to main as `chore: update snapshots`, with no review. The job and its bot account were removed in September 2026.
