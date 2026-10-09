---
description: When Corvane databases are backed up and how long backups are kept.
tags: [backup, database]
---

# Corvane backup schedule

Corvane databases receive a full backup every Sunday at 01:00 UTC. Incremental backups run each 6 hours on the other days. Backups are stored in the bucket corvane-backups-eu with versioning on. Full backups are retained for 12 weeks and incrementals for 14 days. A restore drill runs on the first Tuesday of every month. Backup failures appear in the Monday report. The restore drill has to finish in under 90 minutes, or the team opens an incident.
