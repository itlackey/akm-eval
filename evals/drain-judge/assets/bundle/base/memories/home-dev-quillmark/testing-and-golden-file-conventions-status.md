---
description: "Investigation into golden file drift in payment processor tests"
evidence: User correction at 2026-09-30T15:32:56Z after agent manually patched a
  golden file.
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

## Incident #402: Golden File Drift

**Date:** 2026-11-03

We are investigating unexpected diffs in `TestProcessPayment` golden files after the recent schema migration. Initial triage has ruled out race conditions in the test harness and incorrect `go test -update` invocation. The team suspects the issue stems from non-deterministic JSON marshaling order in the `encoding/json` package when map keys are involved.

**Current Status:**
- Verified that `go version` is consistent across CI runners.
- Confirmed that `git diff` shows only whitespace changes in unrelated files.
- **Next Steps:** We are pinning the Go version to 1.21.4 in the CI pipeline to isolate version-specific behavior. Additionally, we are refactoring the test cases to use `mapstructure` for deterministic key ordering before re-running the update flag. Commit `a1b2c3d` contains the initial patch for key sorting.

Expect a resolution update by EOD.
