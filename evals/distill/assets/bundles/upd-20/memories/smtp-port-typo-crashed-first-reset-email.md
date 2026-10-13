---
description: "A typo in the SMTP port crashed the accounts service two days after the deploy, on the first password reset email."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-29
---
The accounts service was deployed on a Friday with `SMTP_PORT=587x`, a typo.
Nothing read the port until the first password reset email on Sunday, when the
mailer crashed, and every reset failed for six hours until someone was paged.
The service now parses every setting at startup, and the same typo stops the
deploy with a message naming `SMTP_PORT`.
