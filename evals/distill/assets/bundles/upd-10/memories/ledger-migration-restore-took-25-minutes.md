---
description: "A failed ledger migration was undone from the backup taken just before it; restoring the 40 GB dump took 25 minutes."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-08
---
The ledger migration on 2026-09-07 dropped a column that the billing job still
read. The backup taken right before the migration was used to undo it, but
restoring the 40 GB dump took 25 minutes, and billing was down for all of that
time. The restore had never been timed before, so the maintenance window had
been planned at 10 minutes.
