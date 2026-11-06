---
description: "How the notification digest is sent."
team: messaging
project: beacon
owners:
  - ines
review_cycle: quarterly
tags:
  - notifications
---
The digest job collects a day of notifications per recipient and sends one
email. It runs once a day from the scheduler.
