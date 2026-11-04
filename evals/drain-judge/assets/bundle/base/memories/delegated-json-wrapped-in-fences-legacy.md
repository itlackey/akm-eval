---
description: "Retired approach for handling JSON parsing errors in the tagging model."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-22
---

Previously, the team relied on a manual post-processing step to strip Markdown code fences from the tagging model's output. This heuristic approach was necessary because approximately 12.5% of responses included triple backticks and the 'json' language identifier, causing standard JSON parsers to fail. The team maintained this fragile workaround for two years, constantly monitoring error rates and manually logging failed articles for retry. On March 15, 2026, this approach was retired in favor of the `response_format` parameter. By explicitly setting `response_format` to `json_object` in the API request, the model now guarantees valid JSON output without markdown wrappers. This change eliminated the need for regex stripping and reduced untagged articles to zero, simplifying the pipeline significantly. This note remains for historical context regarding the legacy parsing logic.
