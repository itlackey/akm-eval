---
description: "quillmark once kept expected test output inline as string constants, before golden files."
evidence: "User correction at 2026-09-30T15:32:56Z, which referred to the old tests."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:17:24.138Z
verified:
  - by: human:user
    at: 2026-11-04T01:17:24.138Z
provenance:
  sources:
    - resource: claude:preference-09
---

quillmark's renderer tests used to hold the expected output as long string constants inside each `_test.go` file, and they were updated by copying the actual output from a failing run. That style was retired in 2026 when the tests moved to golden files in `testdata`.
