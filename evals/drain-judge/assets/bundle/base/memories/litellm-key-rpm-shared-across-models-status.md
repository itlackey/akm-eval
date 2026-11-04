---
description: "Investigation into LiteLLM virtual key rate limiting overlap causing 429 errors."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-02
---

## Status Report: 2026-11-04

**Incident**: Overnight batch jobs failing with HTTP 429 at 60 RPM.

**Ruled Out**:
- Upstream provider throttling (logs show healthy capacity).
- Network latency spikes (p99 < 200ms).
- Incorrect environment variable injection (keys loaded correctly).

**Current Hypothesis**:
The virtual key `vk_prod_8a9b` has a global `rpm_limit: 60`. Both the summarizer and classifier models route through this single key, causing them to compete for the same minute budget. The proxy does not support per-model limits on virtual keys.

**Next Steps**:
1. Provision a second virtual key `vk_class_1c2d` with `rpm_limit: 120`.
2. Update batch config to split traffic: `SUMMARIZER_KEY` -> `vk_prod_8a9b`, `CLASSIFIER_KEY` -> `vk_class_1c2d`.
3. Deploy via commit `f3e9a1b` and monitor for 429 recurrence.

**Risk**: High. If the proxy enforces strict global limits, splitting keys may not resolve contention if the underlying account limit is hit.
