---
description: "Quarry once sent its mail through its own Postfix server."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-04
---

The Quarry app first sent its email through a Postfix server on the app host, with its own DKIM key, and bounces were read from `/var/mail/bounces`. The server was retired in 2026 when mail moved to a hosted sending service.
