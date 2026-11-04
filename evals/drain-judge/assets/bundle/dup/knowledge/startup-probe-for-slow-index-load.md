---
description: "Give a slow-starting pod a startupProbe so the liveness probe does not kill it."
---

Search pods take about 70 s to load the index before `/healthz` answers; a liveness probe starting at 20 s, three failures ten seconds apart, killed them in a loop. A `startupProbe` on the same endpoint with `failureThreshold: 12` and `periodSeconds: 10` allows two minutes, and liveness takes over only after it passes.
