---
description: "Retired approach of relying on static code searches for dynamic config references"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-30
---

Prior to March 15, 2026, the team relied on static code analysis to identify unused exports. This approach was retired because it failed to detect runtime dependencies constructed via string interpolation, such as `handlers[f"export_{fmt}"]`. The legacy CSV export removal incident demonstrated that `grep` or IDE search tools miss references embedded in configuration files or generated dynamically. We replaced this with a dynamic dependency graph analysis tool called `ConfigTrace`. ConfigTrace parses configuration schemas and runtime handler registration logic to map actual usage, ensuring that exports referenced in YAML or JSON configs are preserved even if no direct code import exists. This note is kept for historical context only.
