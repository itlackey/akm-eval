---
description: "Fixing GitHub CLI pagination limits in audit scripts"
---

The Quillfeather Press repository audit previously reported only 30 open items, despite the tracker displaying 74. This discrepancy occurred because the `gh issue list` command defaults to a maximum of 30 results. The tool silently truncates output without issuing a warning when this threshold is reached. The original script omitted the `--limit` flag, causing all counts to be artificially capped at 30. By executing the command with `--limit 200`, the full set of 74 issues was successfully retrieved. To prevent future silent failures, the updated script now explicitly sets the limit to 200. Additionally, it includes a check that triggers an error if the returned count matches the limit, indicating potential further truncation. Note that `gh pr list` shares this same default behavior of returning 30 items.
