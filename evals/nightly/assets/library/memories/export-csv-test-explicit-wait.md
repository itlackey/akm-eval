---
description: "The export-csv test was intermittent because it clicked before the table loaded; waiting for the first row fixed it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-07
---
The `export-csv` test failed intermittently because it clicked the Export button
before the results table had finished loading. A fixed 2 second sleep had hidden
the problem on fast machines and failed on slow ones. Waiting for the first
table row to be visible before clicking made the test stable on both.
