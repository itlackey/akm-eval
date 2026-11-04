---
description: "Checkout outage on 2026-09-07: nine minutes of timeouts during the release migration; postmortem scheduled."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-07
---

2026-09-07: checkout requests timed out for nine minutes during this afternoon's release, while the migration added an index on `orders.created_at`. The index is in place and checkout is back. The postmortem is set for Wednesday; releases are frozen until then.
