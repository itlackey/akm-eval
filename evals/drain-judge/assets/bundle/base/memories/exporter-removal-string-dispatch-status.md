---
description: "Status report on the legacy CSV export handler refactoring efforts."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-30
---

As of October 15, 2026, the `export_legacy_csv` module remains in the codebase despite the initial removal attempt in commit `a3f9c21`. The nightly build pipeline (Job #402) is currently stable, confirming that the runtime handler resolution logic `handlers[f"export_{fmt}"]` successfully locates the legacy function. 

Pending work includes updating the production configuration file `config/exports.yaml` to remove the `legacy_csv` format entry, which is scheduled for the November 1 sprint. We are also refactoring the test suite to explicitly cover dynamic handler resolution for all configured formats, not just `csv` and `json`. The previous KeyError incident has been documented in the team wiki to prevent similar configuration drift. No further code changes are planned until the config migration is complete.
