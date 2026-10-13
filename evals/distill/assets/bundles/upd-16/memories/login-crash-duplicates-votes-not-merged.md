---
description: "Fourteen duplicates of the login crash were closed with a comment naming TRK-388, so their votes never reached it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-21
---
Fourteen tickets about the login crash were closed as duplicates of TRK-388,
each with a comment naming it. The tracker moves votes and watchers to the
original only when the `duplicate of` field is set, not from a comment, so
TRK-388 showed 3 votes when 31 people had reported the crash. Setting the field
on the fourteen tickets moved the votes, and the crash went to the top of the
triage list.
