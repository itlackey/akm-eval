---
description: TTL handling around a DNS record cutover.
updated: 2026-05-06
---

Lower a DNS record's TTL to 60 seconds a day before pointing it at a new
target, and restore the usual 3600 seconds only after the new target has
served traffic for 24 hours. Records change only through `dns/zones.tf`, never
in the provider console.
