---
description: The signals Zenith search uses to rank results.
tags: [search, ranking]
---

# Zenith search ranking

Zenith search ranks results by a text score and a freshness score. The text score is BM25 over the title and the body. A title match counts three times a body match. The freshness score halves every 90 days. Results are cut off at 200 candidates before ranking. The weights live in the file ranking.yaml. Results in a language other than the user's get half the text score.
