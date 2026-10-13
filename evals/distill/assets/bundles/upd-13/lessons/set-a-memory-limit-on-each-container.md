---
description: "Set a memory limit on each container, so one that grows cannot take the memory the host's other services need."
when_to_use: "When writing a compose file or a deployment for a service."
type: lesson
tags:
  - infra
  - containers
updated: 2026-09-14
---

Set a memory limit on each container.
A container without a limit can take the memory the host's other services need.
