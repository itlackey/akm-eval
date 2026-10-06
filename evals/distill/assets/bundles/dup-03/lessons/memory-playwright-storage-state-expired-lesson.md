---
description: "Create Playwright's storageState in the global setup of each run, because a saved file from an earlier job can hold an expired session."
when_to_use: "When Playwright tests start on the login page although they use a saved storageState."
type: lesson
tags:
  - playwright
  - ci
updated: 2026-08-30
---

A `storageState` file from an earlier job can outlive its session cookie, which
lasts 12 hours here. Log in once in the global setup of every run and write the
state fresh.
