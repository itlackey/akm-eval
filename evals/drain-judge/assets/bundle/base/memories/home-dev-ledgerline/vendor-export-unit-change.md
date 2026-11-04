---
description: The Ledgerline vendor silently switched the Amount column from
  cents to dollars on 2025-03-01.
evidence: User confirmation at 2026-10-05T15:15:19.000Z; agent's magnitude
  analysis at 2026-10-05T15:13:56.000Z.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:12:33.389Z
verified:
  - by: human:user
    at: 2026-11-04T01:12:33.389Z
provenance:
  sources:
    - resource: claude:buried-02
---

The legacy export file `data/legacy_payments.csv` contains an undocumented unit shift that breaks financial validation. Rows dated before `2025-03-01` have amounts in cents (appearing as integers), while rows from `2025-03-01` onward are in dollars (appearing as decimals). This causes massive discrepancies when summing totals or validating against finance records. The fix is to conditionally divide amounts by 100 for dates prior to the cutoff, documented with a clear comment in the cleaning script.
