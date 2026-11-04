---
description: "Overnight batch on 2026-09-01: 429s from LiteLLM at 60 requests a minute, 1,800 items unfinished."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-01
---

Overnight batch, 2026-09-01: from 01:10 the LiteLLM proxy returned 429 at about 60 requests a minute, and 1,800 of 5,000 items were not processed by morning. The upstream provider shows no throttling. The batch was stopped at 07:00; the rest will run tonight once the key limits are checked.
