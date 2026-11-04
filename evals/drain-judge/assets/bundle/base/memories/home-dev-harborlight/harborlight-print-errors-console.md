---
description: "harborlight used to print errors with console.error and exit 1 for every failure; that pattern was dropped."
evidence: "User's description at 10:52:10 of the error handling the fail() helper replaced."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:18:02.721Z
verified:
  - by: human:user
    at: 2026-11-04T01:18:02.721Z
provenance:
  sources:
    - resource: claude:preference-11
---

harborlight commands used to report errors with a bare `console.error(err.message)` followed by `process.exit(1)`, for usage mistakes and runtime failures alike, and Commander's own messages were left unchanged. Scripts calling the CLI could not tell a bad flag from a failed run. This pattern was retired in October 2026 and replaced by the `fail()` helper and the Commander overrides.
