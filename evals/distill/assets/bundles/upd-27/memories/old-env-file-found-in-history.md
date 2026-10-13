---
description: "A secret scan found a .env file committed in 2024; deleting it had not been enough, so the payment key was rotated."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-13
---
A secret scan of the Gullwing repository found a `.env` file that had been
committed in March 2024 and deleted a week later. The payment provider key in
it was still valid. Deleting a file does not remove it from the history, so
anyone with an old or new clone still had the key. The key was rotated the same
day, and the history was left as it is, because rewriting it would break every
open branch.
