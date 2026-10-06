---
description: "Wait for a visible element before acting, because a fixed sleep hides a race on fast machines and fails on slow ones."
when_to_use: "When a UI test clicks or reads something that loads asynchronously."
type: lesson
tags:
  - testing
updated: 2026-09-07
---

Replace a fixed sleep with a wait for a specific element to be visible, such as
the first row of the results table. A sleep that passes on a fast machine fails
on a slow one, and it hides the race.
