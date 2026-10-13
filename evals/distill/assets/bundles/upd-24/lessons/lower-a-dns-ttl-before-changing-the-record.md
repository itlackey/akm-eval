---
description: "Lower a DNS record's TTL a day before changing it, so resolvers pick up the new value within minutes."
when_to_use: "When moving a hostname to a new server or address."
type: lesson
tags:
  - infra
  - dns
updated: 2026-09-16
---

Lower the record's TTL a day before changing a DNS record.
Resolvers keep serving the old value until the TTL they cached runs out.
