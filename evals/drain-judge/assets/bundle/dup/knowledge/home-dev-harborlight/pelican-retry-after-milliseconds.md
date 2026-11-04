---
description: "Pelican sends Retry-After in milliseconds; its docs are wrong."
---

Pelican's `Retry-After` header holds milliseconds, though the vendor docs say seconds: `retry-after: 1500` meant a wait of about two seconds. Code that multiplied it by 1000 slept 25 minutes after one 429. Use the value as milliseconds, and test a vendor's header units yourself rather than trusting their docs.
