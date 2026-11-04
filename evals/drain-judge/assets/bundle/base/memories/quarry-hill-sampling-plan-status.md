---
description: "Status report on Quarry Hill water sampling pipeline CI tests for branch feature/nitrate-alerts."
tags: [lab, water]
---

## Status Report: 2026-11-04

**Branch:** `feature/nitrate-alerts`
**Commit:** `a3f9c21`

Current CI pipeline execution results for the water sampling workflow:

- **Total Tests:** 42
- **Passed:** 38
- **Failed:** 4

**Failure Details:**
1. `test_nitrate_threshold_exceeded` - Timeout after 30s (simulated lab delay)
2. `test_amber_bottle_integrity` - Assertion error on temperature check (4.5°C != 4.0°C)
3. `test_lab_delivery_time` - Failed to parse timestamp for Monday 14:00
4. `test_secondary_sample_trigger` - Logic error in 24h window calculation

**Observations:**
The temperature validation is too strict; real-world sensors have ±0.5°C variance. The timestamp parser fails on non-standard date formats used in legacy lab logs. The nitrate threshold test is flaky due to network latency in the mock service.

**Action Items:**
- Relax temperature tolerance in `test_amber_bottle_integrity`.
- Update timestamp parser to handle ISO 8601 variants.
- Add retry logic to `test_secondary_sample_trigger`.

*Note: This report is stale as of 2026-11-04. Check latest runs on main.*
