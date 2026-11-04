---
description: "Status report on harborlight CLI error convention implementation."
evidence: User correction at 10:52:44; fix applied to cli.ts at 10:53:34.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:18:02.721Z
verified:
  - by: human:user
    at: 2026-11-04T01:18:02.721Z
provenance:
  sources:
    - resource: claude:preference-11
---

**Date:** 2026-10-14
**Branch:** `feat/strict-errors`
**Commit:** `a3f9c2b`

Current CI pipeline status for the `harborlight` CLI error handling refactor:

- **Total Tests:** 42
- **Passed:** 38
- **Failed:** 4

The failures are concentrated in the `src/util/tty.test.ts` suite. Specifically, the `fail()` helper is not correctly prefixing stderr with `harbor: ` in the mocked TTY environment. The Commander.js override tests are passing, but integration tests for usage errors are flaky due to race conditions in the exit code assertion.

Immediate action required: Fix the TTY mock to capture stderr correctly before the prefix is applied. The exit code logic for usage errors needs a retry mechanism in the test harness to account for async command resolution. This blockage prevents merging to `main` until all 42 tests pass consistently across three consecutive runs.
