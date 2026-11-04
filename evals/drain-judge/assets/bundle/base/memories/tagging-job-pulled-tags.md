---
description: "The tagging job once pulled tags out of the model's free-text reply with a regex."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-22
---

The first version of the tagging job asked the model for a comma-separated list of tags and pulled them out with a regex, `Tags?:\s*(.+)`. Replies that did not start with "Tags:" were skipped. It was replaced in 2026 when the job switched to asking for a JSON object.
