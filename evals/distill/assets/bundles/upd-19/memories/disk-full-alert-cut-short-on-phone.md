---
description: "A disk-full alert went unseen for 40 minutes because the phone showed only its first 60 characters, all host name and check id."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-31
---
A disk-full alert on the archive host was missed for 40 minutes. The phone's
push notification shows only the first 60 characters of the message, and the
template started with the full host name and the check id, so the notification
never got as far as the words disk full. Moving the action to the start of the
message, `Free space on /var: disk 97% full`, made it the first thing on the
lock screen.
