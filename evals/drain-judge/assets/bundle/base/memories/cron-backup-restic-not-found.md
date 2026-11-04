---
description: "The nightly backup failed from cron for nine days because cron's PATH lacks /usr/local/bin, where restic is installed."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-06
---
The nightly backup of the Corbel wiki had not run for nine days. The script
worked when run by hand, but from cron it stopped at the first line that calls
`restic`, with `restic: command not found` in the mail cron sends. Cron starts
jobs with a short default PATH of `/usr/bin:/bin`, and restic is installed in
`/usr/local/bin`. Adding `PATH=/usr/local/bin:/usr/bin:/bin` at the top of the
crontab fixed it, and the next night's backup ran. The missed nine days were
caught by a weekly check of the backup dates.
