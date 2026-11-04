---
description: "The Quillfeather Press backlog audit counted 30 issues because gh issue list returns 30 results by default."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-22
---
The backlog audit for the Quillfeather Press repository reported 30 open
issues, but the tracker showed 74. `gh issue list` returns only the first 30
results unless `--limit` is given, and it does not warn when it cuts the list
short. The audit script called it without `--limit`, so every count it printed
was capped at 30. Running it again with `--limit 200` returned all 74 issues.
The script now passes `--limit 200` and stops with an error when the number of
results equals the limit, because the list may still be truncated. `gh pr list`
has the same default of 30.
