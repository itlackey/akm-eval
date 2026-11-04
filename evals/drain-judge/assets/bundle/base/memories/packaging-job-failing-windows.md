---
description: "Packaging job on 2026-07-08: failing on the Windows agent with bad interpreter, release candidate not built."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-08
---

2026-07-08: the packaging job has failed on the Windows build agent since this morning with `/bin/bash^M: bad interpreter`. Linux agents are fine but busy, so today's release candidate is not built. The agent was reimaged last week, which is the first suspect.
