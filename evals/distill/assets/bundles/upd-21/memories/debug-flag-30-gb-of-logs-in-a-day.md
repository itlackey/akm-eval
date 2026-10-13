---
description: "A debug flag left on wrote 30 GB of logs in a day and filled the disk; logrotate now also rotates at 500 MB."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-11
---
The `IMPORT_DEBUG` flag was left on after a support call, and the importer
wrote 30 GB of logs in one day. The daily rotation never ran in time, the disk
filled at 03:10, and the database on the same disk stopped accepting writes.
Adding `maxsize 500M` to the logrotate config makes it rotate any log that
passes 500 MB at the next hourly check, whatever the date.
