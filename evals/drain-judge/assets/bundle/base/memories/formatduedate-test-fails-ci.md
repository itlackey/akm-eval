---
description: "formatDueDate test on 2026-09-29: fails in CI only, cause still unknown."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-29
---

2026-09-29: the `formatDueDate` test has failed on every CI run since Monday and passes on all laptops. CI prints 30 September where 1 October is expected. Node and package versions are the same on both. The test is skipped on main for now, with ticket 318 to find the cause.
