---
description: "Retired approach for handling LiteLLM rate limits via per-model proxy configuration"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-02
---

Previously, the team attempted to resolve shared rate limit issues by configuring per-model limits directly within the LiteLLM proxy configuration file. This approach aimed to isolate the RPM budgets for the summarizer and classifier without creating separate virtual keys. However, this method proved unreliable and difficult to maintain across different proxy versions. On March 15, 2026, this strategy was officially retired due to inconsistent enforcement and lack of granular control. It was replaced by the Multi-Key Strategy, which assigns distinct virtual keys with specific `rpm_limit` values to each model. This new approach ensures strict isolation of rate limits, preventing one model's traffic from impacting another's quota. The team now explicitly manages `SUMMARIZER_KEY` and `CLASSIFIER_KEY` in the environment, providing a more robust and predictable solution for high-throughput batches. This note is kept for historical reference only.
