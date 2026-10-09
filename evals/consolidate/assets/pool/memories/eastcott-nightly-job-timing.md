---
description: When the Eastcott nightly job runs and what it does.
tags: [jobs, nightly]
---

# Eastcott nightly job

The Eastcott nightly job rebuilds the search index. The job starts at 04:00 UTC. A failed run is retried once. The job writes its log to the folder /var/log/eastcott. The job needs about 40 minutes. Its schedule is kept in the file schedule.yaml. The job is owned by the data team.
