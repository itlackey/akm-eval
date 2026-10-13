---
description: "Password reset emails from the Quarry app went to spam after a switch to a new sending service that SPF did not list."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-04
---
After the Quarry app moved its mail to a new sending service on 2026-08-03,
users at two large mail providers found password reset emails in spam. The
domain's SPF record still listed only the old service, so the new service's
servers failed the SPF check. Adding the new service's `include:` to the SPF
TXT record fixed it, and the next day reset emails reached the inbox again. The
SPF record now lists both services until the old one is shut down at the end of
the month.
