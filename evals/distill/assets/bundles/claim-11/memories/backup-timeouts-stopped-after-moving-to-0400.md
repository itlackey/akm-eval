---
description: "Moving the nightly database backup from 02:00 to 04:00 stopped its timeouts for four nights; the cause is a guess."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-25
---
The nightly database backup had timed out on five of the last twelve nights at
02:00. Moving it to 04:00 on 2026-09-21 gave four clean nights in a row. The
guess is that it clashed with the log rotation that compresses last week's logs
at 02:00, but nobody has checked the disk activity at that hour, so this is not
confirmed. Four nights is also short, since the timeouts had come in runs of
two or three before.
