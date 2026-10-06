---
description: "An API that pages its results needs a loop that follows the next link until none is left, or an export silently stops at the first page."
when_to_use: "When a script reads a list from a REST API that returns results in pages."
type: lesson
tags:
  - api
  - tracker
updated: 2026-07-08
---

The REST API returns at most 100 items per page. Follow the `next` link in the
`Link` response header until it is absent, and compare the count with the total
the tracker shows.
