---
description: "Resolving a cron failure for the Corbel wiki backup caused by an incomplete system path preventing restic execution."
---

The automated nightly backup process for the Corbel wiki ceased functioning for a duration of nine days. While manual execution succeeded, the scheduled task triggered by cron encountered an error where the utility `restic` could not be located. This issue stemmed from cron's restricted environment, which initializes with a limited search path consisting solely of `/usr/bin` and `/bin`. Since the binary resides in `/usr/local/bin`, the system failed to find it. To rectify this, the crontab file was modified to explicitly define the environment variable `PATH` as `/usr/local/bin:/usr/bin:/bin`. After this adjustment, the subsequent nightly run completed successfully. The gap in coverage was identified through a separate weekly verification routine that inspects backup timestamps, ensuring data integrity despite the temporary outage.
