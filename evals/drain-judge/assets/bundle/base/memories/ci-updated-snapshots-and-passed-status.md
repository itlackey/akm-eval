---
description: "Web client snapshot tests on 2026-09-03: jest -u removed from CI, 7 snapshots now failing on main."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-03
---

2026-09-03, after removing `-u` from the CI script: seven snapshot tests now fail on main, five of them for the broken header. Two belong to the footer and may be intended changes; their owner has been asked. Main stays red until the header fix is merged.
