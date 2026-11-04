---
description: "Retired approach of updating snapshots in CI"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-03
---

Previously, the team allowed snapshot updates in CI by running `jest -u`. This approach was retired on March 15, 2026, because it silently masked layout regressions for weeks. The CI script would rewrite mismatched snapshots and discard them, preventing failure detection. This was replaced by the "Local Update Review" approach. Under this new method, snapshots are only updated on developer machines. Developers must commit these changes and include them in the pull request for explicit review. This ensures that visual changes are intentional and visible to the team before merging. The CI pipeline now strictly runs `jest --ci`, failing immediately if snapshots do not match or are missing, thereby enforcing strict visual regression control.
