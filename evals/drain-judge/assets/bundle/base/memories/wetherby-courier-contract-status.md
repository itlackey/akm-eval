---
description: "Status report on Northline Express integration tests failing due to API timeout."
tags: [logistics, courier]
---

## Status Report: Northline Courier Integration
**Date:** 2026-11-03
**Branch:** `feat/northline-api-v2`
**Commit:** `a7f3b2c`

Current CI pipeline for the Northline Express contract module shows critical instability. Out of the last 15 automated runs, 9 have passed successfully, while 6 have failed. The failures are consistently occurring in the `test_pallet_booking` suite, specifically during the simulated 25kg threshold validation. The error logs indicate a timeout when contacting the Northline staging API, suggesting their endpoint is experiencing latency issues or our retry logic is insufficient.

We need to investigate the network configuration for the pallet booking service immediately. The contract renewal is in June, but we cannot proceed with the migration until this flakiness is resolved. Please prioritize stabilizing the CI builds before merging any further changes to this branch.
