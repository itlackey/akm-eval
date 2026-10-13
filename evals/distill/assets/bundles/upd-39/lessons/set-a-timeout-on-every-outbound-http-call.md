---
description: "Set a timeout on every outbound HTTP call, so a slow service cannot hold the caller's workers."
when_to_use: "When writing code that calls another service over HTTP."
type: lesson
tags:
  - coding
updated: 2026-09-26
---

Set a timeout on every outbound HTTP call.
A call with no timeout can wait as long as the other service takes.
