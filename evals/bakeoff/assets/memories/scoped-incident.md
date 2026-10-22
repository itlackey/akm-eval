---
title: Staging relay incident notes
scope:
  user: operator-17
  agent: incident-triage
  run: 77
  channel: staging
updated: 2026-10-18
---

The relay-worker 7.4 incident was investigated in staging. Increasing the retry budget from 2 to 4 let the staging queue drain after a transient connection refusal, while the health check remained green. This was a staging experiment only; the production queue was not inspected or changed, so its status remains unknown. Keep the retry-budget cause and the boundary of that observation together.
