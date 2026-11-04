---
description: "Schema changes on the orders database were once run by hand by the DBA in a maintenance window."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-08
---

Schema changes to the orders database were once applied by hand: the DBA ran the SQL in a monthly Sunday maintenance window, with checkout switched to a read-only page. That process was retired in 2026 when schema changes moved into release migrations.
