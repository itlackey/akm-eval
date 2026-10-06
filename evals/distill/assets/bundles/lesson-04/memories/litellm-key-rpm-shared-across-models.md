---
description: "A LiteLLM virtual key's rpm_limit was shared by two models, so the batch hit 429 at 60 requests a minute."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-02
---
The overnight batch began returning 429 from the LiteLLM proxy at about 60
requests a minute, although the upstream provider allows far more. The virtual
key the batch used had `rpm_limit: 60`. The proxy applies that limit to the key
as a whole, not to each model, so the summarizer and the classifier shared one
budget of 60 a minute. Giving the classifier its own key with `rpm_limit: 120`
removed the 429s. The batch now reads two keys from its environment,
`SUMMARIZER_KEY` and `CLASSIFIER_KEY`. Per-model limits in the proxy
configuration were not tried.
