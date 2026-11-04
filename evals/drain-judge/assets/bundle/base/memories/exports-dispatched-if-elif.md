---
description: "Exports were once dispatched by an if/elif chain on the format name."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-30
---

The export job used to pick its handler with an if/elif chain in `run_export()`, one branch per format, so removing a function broke the import at once. The chain was retired in 2026 when handlers moved to a lookup table built from the format name.
