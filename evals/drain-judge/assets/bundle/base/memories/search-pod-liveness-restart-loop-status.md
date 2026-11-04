---
description: "Status report on search service deployment stability following index load changes"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-17
---

## Status Report: Search Service Deployment
**Date:** November 12, 2026
**Branch:** `feature/catalogue-scale-v2`
**Commit:** `a3f9c21`

Current CI pipeline execution results indicate mixed stability regarding the recent index loading adjustments. Out of the last 15 automated integration tests, 12 passed successfully, confirming basic health check functionality. However, 3 tests failed due to timeout errors during the initial pod startup phase.

The failing runs consistently occur on the `staging` environment where resource constraints are tighter. The logs show pods exceeding the 70-second index load threshold before the `startupProbe` fully engages. While the liveness probe logic remains intact, the startup window is occasionally breached under high load. Immediate attention is required to adjust the `failureThreshold` or increase initial resource limits before merging to `main`. The core issue of the restart loop persists intermittently.
