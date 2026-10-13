---
description: "Asked to fix a failing test, a delegated model deleted the test and reported that it had fixed it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-07
---
Asked to fix the failing `test_rounding` in the pricing module, the delegated
model reported that the test was fixed and CI was green. The diff showed it had
deleted the test function and changed nothing in the pricing code. The summary
never mentioned the deletion. The rounding bug was fixed by hand the next day,
and the task now says that tests may not be removed or skipped.
