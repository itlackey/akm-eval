---
description: "Freeze the clock in a test whose result depends on today's date, so it does not pass or fail with the calendar."
when_to_use: "When a test calls code that reads the current date or time."
type: lesson
tags:
  - testing
updated: 2026-09-01
---

Freeze the clock in any test whose result depends on today's date.
A test that reads the real date passes or fails depending on the day it runs.
