---
description: "A Matrix notification vanished because the # in the room alias started a URL fragment; %23 fixed it."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-16
---
A deploy notification to the ops Matrix room never arrived, and `notify.sh`
printed no error. The Apprise URL in the config wrote the room alias
unescaped: `matrixs://matrix.example.org/#ops-alerts:example.org`. Everything
after a `#` is read as a URL fragment and dropped, so Apprise addressed no
room at all. Writing the alias as `%23ops-alerts:example.org` fixed it.
`notify.sh --dry-run` did not show the problem, because it resolves the config
and tags without sending, so the fix was confirmed by sending a real test
message to the room.
