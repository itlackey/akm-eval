---
description: "A LiteLLM virtual key's rpm_limit covers all models on the key together."
---

LiteLLM enforces a virtual key's `rpm_limit` across the whole key, not per model. A batch sending summarizer and classifier calls on one key with `rpm_limit: 60` got 429s at 60 a minute. A second key for the classifier (`rpm_limit: 120`) fixed it; the batch reads `SUMMARIZER_KEY` and `CLASSIFIER_KEY`.
