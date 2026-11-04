---
description: "The search service's pods restarted in a loop once loading the index took longer than the liveness probe allowed."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-17
---
After the catalogue doubled, the search service's pods went into a restart loop
on the cluster. Each pod needs about 70 seconds to load its index before it
answers `/healthz`, but the liveness probe started checking after 20 seconds
and killed the container after three failed checks ten seconds apart. Adding a
`startupProbe` on the same endpoint with `failureThreshold: 12` and
`periodSeconds: 10` gave the pods two minutes to start, and the liveness probe
only takes over once the startup probe has passed. The pods have started
cleanly on every deploy since.
