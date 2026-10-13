---
description: "The September member mailing went out with an unsubscribe link to the staging site, which nobody had clicked in the test send."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-03
---
The September member mailing went to the whole list with its unsubscribe link
pointing at the staging site, because the template took the base URL from the
environment it was built in. A test send had gone to a real inbox, but only the
article links were clicked. Over two days 64 people who tried to unsubscribe
reached a login page, and three complained to the mail provider. The template
now takes the base URL from the send settings.
