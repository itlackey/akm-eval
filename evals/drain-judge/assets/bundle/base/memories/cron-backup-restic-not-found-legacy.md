---
description: "Retired method for handling missing binaries in cron jobs using absolute paths."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-06
---

Previously, we resolved cron-related command not found errors by hardcoding absolute paths for every binary in the crontab entries. This approach was brittle and difficult to maintain as the number of scripts grew. On March 15, 2026, we retired this practice in favor of the `PATH` variable export method. The new standard requires defining a comprehensive `PATH` at the top of the crontab file, ensuring all scripts inherit the correct environment without repetitive path specifications. This change simplifies maintenance and reduces the risk of path-related failures. This note is kept for historical reference only to document the evolution of our backup infrastructure configuration.
