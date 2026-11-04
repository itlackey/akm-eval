---
description: "Moving Ledgerline report queries to Berlin time, 2026-10-02: 5 of 8 queries done."
evidence: "User instruction at 16:10:22 and the agent's query edits."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:17:43.970Z
verified:
  - by: human:user
    at: 2026-11-04T01:17:43.970Z
provenance:
  sources:
    - resource: claude:preference-10
---

Converting the churn and revenue queries to Europe/Berlin boundaries, 2026-10-02: five of the eight queries in `reports/sql/` are done. `monthly_revenue.sql`, `mrr_by_plan.sql` and `churn_cohorts.sql` still use UTC dates, so September revenue in the dashboard is off by the last two hours of the month. The rest goes in tomorrow.
