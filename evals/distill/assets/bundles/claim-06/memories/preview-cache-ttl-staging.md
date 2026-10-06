---
description: "Lowering PREVIEW_CACHE_TTL to 60 s on the staging preview server fixed stale pages and raised CPU use there."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-23
---
To check for stale previews, the `PREVIEW_CACHE_TTL` on the staging preview
server was lowered from 3600 to 60 seconds. Stale pages stopped showing up
within a minute during the test, and CPU use rose from about 5 percent to
about 9 percent. The change was made on staging only and was reverted after the
test, so production still uses 3600. There are no CPU numbers for production
traffic, which is about ten times larger.
