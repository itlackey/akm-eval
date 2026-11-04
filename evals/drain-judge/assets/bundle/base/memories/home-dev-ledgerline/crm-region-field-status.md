---
description: "Status report on CRM region mapping migration as of November 2026"
evidence: User correction at ts=08:49:54 and subsequent script edits.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:37.578Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:37.578Z
provenance:
  sources:
    - resource: claude:buried-07
---

## Status Report: CRM Region Migration
**Date:** November 12, 2026
**Branch:** `feat/ledger-region-sync`
**Commit:** `a3f9c2b`

Current CI pipeline results for the ledger integration branch:

- **Total Tests:** 142
- **Passed:** 138
- **Failed:** 4

The four failing tests are located in `tests/integration/test_crm_export.py`. They specifically check for the legacy `Region` column presence in the raw CSV output. Since we have deprecated the CRM export's `Region` column in favor of the `billing_country` join from the ledger, these assertions are now obsolete.

The remaining 138 tests confirm that the new mapping logic correctly translates `billing_country` codes to internal region identifiers. The data integrity checks pass, ensuring no loss of geographic granularity. We need to update the failing integration tests to reflect the new schema before merging. The core logic is stable, but the test suite requires cleanup to reflect the architectural shift away from the unmaintained CRM export.
