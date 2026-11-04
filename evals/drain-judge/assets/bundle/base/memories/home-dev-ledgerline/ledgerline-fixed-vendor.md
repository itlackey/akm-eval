---
description: "Ledgerline once fixed the vendor's payment amounts by hand in a spreadsheet each month."
evidence: "User confirmation at 2026-10-05T15:15:19.000Z, describing the old process."
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

Until October 2026 a Ledgerline analyst corrected the vendor's payment amounts by hand: the monthly export was opened in a spreadsheet, rows that looked too large were divided by 100, and the file was saved as `legacy_payments_fixed.csv`. That manual step was retired when the cleaning script took over the conversion.
