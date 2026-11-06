---
description: "The nightly staging refresh restored real customer emails; a scrub step before the restore fixed it."
source: "session:harbor-staging-refresh"
observed_at: "2026-10-14"
confidence: 0.95
tags:
  - staging
  - data
type: memory
---
The nightly staging refresh restored production rows with real customer emails
in them. A scrub step now runs on the dump before the restore, and it replaces
every email address with a placeholder. After the change the staging tables held
no real addresses, and the refresh took four minutes longer.
