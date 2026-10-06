---
description: "Recap of the rules followed when removing the unused left-pad-lite package from the web client."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-27
---
Recap after removing the unused `left-pad-lite` package from the web client.
Remove a dependency in its own pull request: mixing it with version upgrades or
manifest formatting hides what the removal changed. Never hand-edit the
lockfile; regenerate it with the package manager. Before removing, trace
imports, scripts, plugins, peer requirements and generated code, because a
package can be used indirectly. Afterwards run the full test suite and a clean
install. The removal went through as one small pull request.
