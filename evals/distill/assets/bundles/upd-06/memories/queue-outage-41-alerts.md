---
description: "The queue outage sent 41 alerts in 20 minutes until the checks were grouped under the incident."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-12
---
During the queue outage the pager sent 41 alerts in 20 minutes, one for each
failing check, and the on-call engineer muted the channel after the tenth.
Grouping the checks under the incident id gave one alert. The alert tool groups
by the `incident` label, and a check with no label is still sent alone.
