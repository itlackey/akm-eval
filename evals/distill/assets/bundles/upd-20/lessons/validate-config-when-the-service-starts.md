---
description: "Validate the whole configuration when the service starts, so a bad value fails the deploy and not a request days later."
when_to_use: "When a service reads settings from a file or the environment."
type: lesson
tags:
  - coding
updated: 2026-09-29
---

Validate the whole configuration when the service starts.
A bad value that is only read on first use fails long after the deploy.
