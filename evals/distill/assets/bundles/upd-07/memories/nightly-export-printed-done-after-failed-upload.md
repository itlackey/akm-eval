---
description: "The nightly export printed done after its upload failed; stopping at the first non-zero exit made the failure show."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-15
---
The nightly export script printed "done" while its upload step had failed
with exit code 28, a timeout, so the bucket held yesterday's file. Stopping the
script at the first non-zero exit code made the failure show. The upload tool
exits with 28 for a timeout.
