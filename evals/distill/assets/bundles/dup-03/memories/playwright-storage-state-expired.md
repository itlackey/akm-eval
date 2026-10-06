---
description: "Playwright tests hit the login page after a long CI queue because the saved storageState had expired."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-30
---
Several Playwright tests landed on the login page after a long CI queue. The
saved `storageState` file had been created in an earlier job, and the session
cookie in it lives for 12 hours, so it had expired by the time the tests ran.
Creating the state in the global setup of every run, instead of reusing a file
from an earlier job, fixed it.
