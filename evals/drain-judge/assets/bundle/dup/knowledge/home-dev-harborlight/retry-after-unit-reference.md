---
description: "Pelican API Retry-After header unit discrepancy requires empirical verification."
---

The Pelican platform returns the `Retry-After` HTTP header value in milliseconds, despite official documentation stating seconds. This mismatch caused a critical bug where the previous code multiplied the header by 1000, resulting in a 25-minute sleep for a single 429 response. For example, a header value of `1500` actually meant approximately two seconds, not fifteen hundred seconds. To prevent this, always assume the value is in milliseconds during synchronization tasks. Do not rely on the vendor's written specs for header units. Instead, verify the actual behavior empirically in future sessions. This ensures accurate rate limit handling and avoids excessive delays in sync jobs.
