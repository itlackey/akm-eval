---
description: Repo mandates table-driven tests with t.Run per case, and strictly
  prohibits manual editing of golden files; they must be regenerated via go test
  -update and verified via diff.
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

## Testing Structure
- One `TestXxx` per function.
- Use a slice of cases with `t.Run` for each case.

## Golden File Management
- Never edit golden files by hand.
- Add a `flag.Bool("update", false, "rewrite the golden files in testdata")` to the test file.
- Run `go test -update` to regenerate.
- Always `git diff` the generated files before committing to catch unintended changes.

This pattern prevents drift and ensures intentional updates to expected outputs.
