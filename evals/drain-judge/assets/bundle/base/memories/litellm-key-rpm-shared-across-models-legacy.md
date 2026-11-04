---
description: "The batch once called the provider directly with a single API key, before the LiteLLM proxy."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-02
---

Before the LiteLLM proxy, the overnight batch called the provider's API directly with a single key from `PROVIDER_API_KEY`, and throttling was handled by a sleep of one second between requests. That setup was retired in 2026 when all model calls moved behind the proxy.
