---
description: "Due dates were once formatted with moment-timezone in the user's profile zone."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-30
---

The app used to format due dates with moment-timezone, always in the zone stored on the user's profile, and the tests mocked moment. That library was removed in 2026 when date formatting moved to `Intl.DateTimeFormat`.
