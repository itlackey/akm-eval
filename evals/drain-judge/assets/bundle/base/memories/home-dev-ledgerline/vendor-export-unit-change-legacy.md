---
description: "Retired approach for handling Ledgerline unit shift using regex parsing"
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

## Retired: Regex-Based Unit Detection

**Status:** RETIRED on 2026-04-15

Previously, the team attempted to detect the unit shift by analyzing the magnitude of the `Amount` field using heuristic regex patterns. This approach assumed that values > 1000 were dollars and < 1000 were cents. This heuristic failed catastrophically for high-value transactions in cents and low-value transactions in dollars, leading to inconsistent financial reporting.

**Replacement:** The team replaced this fragile logic with a strict date-based conditional check against the known vendor switch date of 2025-03-01. This deterministic approach eliminates ambiguity and ensures data integrity across all historical records. This note is retained solely for historical context regarding past engineering decisions.
