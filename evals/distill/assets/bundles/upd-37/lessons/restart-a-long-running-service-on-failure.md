---
description: "Set a long-running service to restart when it exits with an error, so one crash does not leave it down."
when_to_use: "When writing a systemd unit for a worker or a daemon."
type: lesson
tags:
  - ops
updated: 2026-08-28
---

Set a long-running service to restart when it exits with an error.
A service that is not restarted stays down until someone notices.
