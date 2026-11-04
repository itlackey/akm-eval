---
description: "Cron's default PATH has no /usr/local/bin, so tools installed there fail under cron."
---

A job that runs by hand can fail under cron with `command not found`: cron starts it with PATH `/usr/bin:/bin`, and the Corbel wiki backup's `restic` lives in `/usr/local/bin`. Set `PATH=/usr/local/bin:/usr/bin:/bin` at the top of the crontab. A weekly check of backup dates found the nine missed nights.
