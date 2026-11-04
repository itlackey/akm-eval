---
description: "Retired Windows CRLF workaround for deploy scripts"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-09
---

Previously, we resolved the `bad interpreter` error on Windows build agents by manually converting line endings in the CI pipeline. This involved adding a pre-job step to run `dos2unix` on all shell scripts before execution. This approach was fragile and required maintenance across multiple repositories.

On March 15, 2026, this method was retired in favor of the `gitattributes` approach. We now use `*.sh text eol=lf` in the root `.gitattributes` file. This ensures Git automatically checks out scripts with LF endings on all platforms, eliminating the need for manual conversion steps. The `gitattributes` solution is declarative, persistent, and prevents future regressions by enforcing consistency at the repository level rather than relying on transient pipeline configurations.
