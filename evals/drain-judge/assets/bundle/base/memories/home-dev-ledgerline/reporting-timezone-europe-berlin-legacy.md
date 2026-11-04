---
description: "Retired note on using UTC for business metrics before switching to Berlin timezone."
evidence: User instruction at 16:10:22
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

HISTORY: This approach was retired on 2026-03-15. Previously, the team standardized all business metrics, including churn and revenue, around UTC to simplify global synchronization. Queries against `customers` and `invoices` tables used raw `timestamptz` values without explicit timezone casting, assuming application-layer conversion handled the offset. This caused frequent off-by-one errors during daylight saving transitions and cross-border reporting discrepancies. The team replaced this with the **Berlin-Anchored Standard**, which mandates explicit casting to `Europe/Berlin` for all financial date boundaries. This ensures consistent day definitions aligned with the primary operational hub, eliminating ambiguity in daily aggregation and preventing revenue leakage due to timezone misinterpretation. Keep this note for historical context only.
