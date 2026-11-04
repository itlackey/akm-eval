---
description: "Retired synchronous index creation approach for the orders table"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-08
---

Prior to March 15, 2026, the team added indexes on the `orders` table using standard synchronous `CREATE INDEX` statements. This approach caused significant downtime because Postgres acquired an exclusive lock during the build process, blocking all checkout writes. For the 80 million row table, this resulted in nine-minute outages where customers experienced timeouts. The team retired this method on March 15, 2026, due to its unacceptable impact on availability. It was replaced by the `CONCURRENTLY` approach, which allows writes to continue while the index is built. Although `CONCURRENTLY` takes longer (approximately 25 minutes), it eliminates the blocking behavior. This note is kept for historical reference only to document the previous limitation and the rationale for the migration to non-blocking index creation strategies.
