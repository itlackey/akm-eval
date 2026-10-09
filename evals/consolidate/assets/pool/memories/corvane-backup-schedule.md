---
description: When Corvane databases are backed up and how long backups are kept.
tags: [backup, database]
---

# Corvane backup schedule

Corvane databases get a full backup every Sunday at 01:00 UTC. Incremental backups run every 6 hours on the other days. Backups are written to the bucket corvane-backups-eu with versioning on. Full backups are kept for 12 weeks and incrementals for 14 days. A restore drill runs on the first Tuesday of each month. The restore drill must finish in under 90 minutes, or the team opens an incident. Backup failures are listed in the Monday report.
