---
description: "Ops Matrix alerts on 2026-09-15: deploy notifications still missing, Apprise config under investigation."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-15
---

Status on 2026-09-15: deploy notifications have not reached the ops Matrix room since the 12th. `notify.sh` exits 0 and `--dry-run` resolves the tags. The Matrix token was rotated this morning with no change. Next is a real test send with debug logging on; the config file has not been touched yet.
