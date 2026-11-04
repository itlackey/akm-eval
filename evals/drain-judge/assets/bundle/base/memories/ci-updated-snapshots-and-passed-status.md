---
description: "Status report on web client snapshot test configuration and header layout fix."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-03
---

As of October 14, 2026, the web client's snapshot testing pipeline has been stabilized following the removal of the `-u` flag from the CI jest command. The previous configuration allowed broken header layouts to persist unnoticed for weeks by silently updating snapshots. 

Current build v2.4.1 includes the corrected header component, verified by passing `jest --ci` runs. The fix was merged in commit a3f9b2c. Pending work includes updating the remaining 12 outdated snapshot files for the dashboard module, which are currently failing locally. We aim to resolve these discrepancies by November 1, 2026, ensuring no snapshot drift occurs in production. Developers must now review snapshot diffs in pull requests before merging.
