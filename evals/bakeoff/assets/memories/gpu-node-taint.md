---
description: Scheduling rule for the GPU training node pool.
updated: 2026-03-26
---

Nodes in the `ml-train` pool carry the taint `gpu=true:NoSchedule`, so only
pods with a matching toleration are scheduled there. Batch inference jobs must
declare the toleration themselves; the default pod template leaves it out.
