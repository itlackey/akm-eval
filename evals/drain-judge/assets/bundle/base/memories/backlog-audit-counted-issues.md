---
description: "The backlog audit once counted issues by scraping the GitHub issues page with curl."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-22
---

The backlog audit first counted issues by fetching the repository's issues page with curl and counting `<a id="issue_` links, one page at a time. It broke whenever GitHub changed the markup, and was replaced in 2026 by a script that calls `gh issue list`.
