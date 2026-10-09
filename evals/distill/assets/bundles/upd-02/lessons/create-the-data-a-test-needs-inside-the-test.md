---
description: "Create the data a test needs inside the test and remove it afterwards, so the test does not depend on the order tests run in."
when_to_use: "When a test reads rows or records that it did not create itself."
type: lesson
tags:
  - testing
updated: 2026-08-28
---

Create the data a test needs inside the test, and remove it afterwards.
A test that reads rows another test left behind fails when the order changes.
