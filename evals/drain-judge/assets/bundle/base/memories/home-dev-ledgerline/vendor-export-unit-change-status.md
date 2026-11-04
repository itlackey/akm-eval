---
description: "Ledgerline payment validation on 2026-10-05: cents fix written, three 2024 rows still off."
evidence: "Agent's validation run at 2026-10-05T15:20:44.000Z."
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

Payments validation, 2026-10-05: the cleaning script now divides pre-2025-03-01 amounts by 100. 2025 totals match Finance. Three 2024 rows still differ, all refunds with negative amounts; the check against Finance's ledger is being rerun with them excluded. The change is not committed yet.
