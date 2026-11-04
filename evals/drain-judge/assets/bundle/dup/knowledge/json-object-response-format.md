---
description: "Set response_format json_object when a local model must return JSON."
---

About one reply in eight from the tagging model came wrapped in a ```json fence, so `json.loads` failed and the article went untagged. Asking for bare JSON in the prompt did not help. Setting `response_format` to `json_object` on the request did: all 400 replies of the next run parsed.
