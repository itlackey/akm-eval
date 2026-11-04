---
description: "Status report on the chat widget polling fix rollout as of November 2026"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-11
---

## Rollout Status: Chat Widget NetworkIdle Fix

**Date:** November 12, 2026

The fix for the order-history Playwright test timeout has been deployed to the **staging** environment. The change replaces `page.waitForLoadState('networkidle')` with a specific visibility assertion for the 'Order history' heading.

**Rollout Metrics:**
- **Environment:** Staging (us-east-1)
- **Percentage Rolled Out:** 100% of staging traffic
- **Status:** Passed all regression suites. CI green for 48 hours.
- **Approver:** Sarah Chen (QA Lead)

**Commit:** `a1b2c3d`

The underlying chat widget polling mechanism remains unchanged. This update only addresses the test harness expectation. Production rollout is pending final sign-off from the Platform Engineering team. No issues observed in the shared page layout integration tests. The fix resolves the 30-second timeout by allowing the test to proceed once the main content is visible, ignoring the persistent 20-second poll from the chat widget.
