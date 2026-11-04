---
description: "Ops alerts used to go to Matrix through a curl script, notify-matrix.sh, before Apprise."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-16
---

Deploy alerts were first sent to the ops Matrix room by `notify-matrix.sh`, a curl script that posted to the room's internal ID with a token kept in `/etc/notify/matrix.token`. It was retired in spring 2026 when notifications moved to Apprise, and the script and token file were removed from the deploy hosts.
