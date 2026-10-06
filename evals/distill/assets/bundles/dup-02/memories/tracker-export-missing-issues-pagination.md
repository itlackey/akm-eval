---
description: "The tracker export for Fennwick listed 100 of 412 issues because it read only the first page of results."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-08
---
The tracker export script reported 100 issues for the Fennwick repository, but
the tracker holds 412. The REST API returns at most 100 items per page, and the
script read only the first page. Following the `next` link in the `Link`
response header until it is absent returned all 412 issues. The script now loops
over the pages and checks that its count matches the total shown in the
tracker's own header.
