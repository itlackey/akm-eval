---
description: "The disk alert at 95 percent fired six minutes before the import filled the volume; the threshold is now 80 percent."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-01
---
During the quarterly import the data volume on the warehouse host went from 95
percent to full in six minutes. The disk alert was set at 95 percent, so it
fired six minutes before the database stopped, and the on-call engineer was
still reading it when the disk filled. The threshold is now 80 percent, which
on that volume leaves about 200 GB of room.
