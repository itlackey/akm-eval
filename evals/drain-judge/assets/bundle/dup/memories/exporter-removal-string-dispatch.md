---
description: "Removing export_legacy_csv broke the nightly job, which builds export handler names from config at runtime."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-30
---
Removing `export_legacy_csv` looked safe: a repository search found no
references, and the test suite passed. The nightly job then failed with
`KeyError: 'export_legacy_csv'`. The job builds handler names from its
configuration at runtime, `handlers[f"export_{fmt}"]`, and the production
config still had `fmt: legacy_csv`. The tests only exercised `csv` and `json`.
Restoring the function fixed the job. For a function whose name follows a
pattern, search for the pattern's prefix and for the name in configuration
files, not only for the full name in code.
