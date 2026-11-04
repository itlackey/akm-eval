---
description: "The search service once ran on a single VM under systemd, before the cluster."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-17
---

The search service used to run on one VM, `search-01`, as a systemd unit that loaded the index at boot, with no health checks; a failed load meant a manual restart. It was retired in 2026 when the service moved to pods on the cluster.
