---
description: "Retired approach for managing golden files via manual editing and snapshot comparison."
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

## Retired: Manual Golden File Maintenance

**Status:** RETIRED on 2026-03-15
**Replaced by:** Automated `go test -update` workflow

Previously, the team maintained golden files by manually editing expected outputs in `testdata/` directories. Developers would run tests, compare the failure output against the file, and manually adjust the file to match the new behavior. This approach was prone to human error, drift, and inconsistent formatting.

### Why It Was Retired
Manual edits led to subtle discrepancies and made it difficult to track what actually changed in the output. The lack of a standardized regeneration process caused merge conflicts and review overhead.

### Historical Context
This note exists solely for historical reference. Do not use this method in new code. The team now strictly enforces the `go test -update` pattern to ensure all golden file changes are intentional, reproducible, and verified via diff before commit. This eliminates manual drift and standardizes the update process across all test suites.
