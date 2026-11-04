---
description: "gh issue list and gh pr list stop at 30 results without --limit."
---

`gh issue list` returns 30 results unless `--limit` is passed, and says nothing when it truncates; an audit counted 30 open issues where there were 74. Pass `--limit 200`, and treat a result count equal to the limit as possibly cut short. `gh pr list` defaults to 30 as well.
