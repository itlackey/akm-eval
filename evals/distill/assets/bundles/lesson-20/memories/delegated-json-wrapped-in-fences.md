---
description: "About one reply in eight from the tagging model came wrapped in a Markdown code fence and failed to parse as JSON."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-22
---
The tagging job asks the local model for a JSON object of tags for each
article. About one reply in eight came back wrapped in a Markdown code fence,
three backticks and the word json, and `json.loads` failed on it, so those
articles were left untagged. Asking for bare JSON in the prompt did not change
the rate. Setting `response_format` to `json_object` on the request, which the
endpoint supports, made every reply in the next run of 400 articles parse.
