---
description: "Retired approach for handling slow search service startup using liveness probe adjustments."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-17
---

Previously, we mitigated the search service's startup loop by increasing the liveness probe's initial delay and timeout thresholds. This approach was retired on March 15, 2026, because it masked underlying performance issues and caused delayed failure detection during actual crashes. The team replaced this with the `startupProbe` pattern, which explicitly separates startup health checks from liveness checks. This ensures the container is not killed while loading the index, while still maintaining robust crash detection once the service is ready. Keeping this note for historical reference only.
