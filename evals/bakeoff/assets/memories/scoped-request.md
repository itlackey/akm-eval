---
title: Staging pool request
scope_user: operator-24
scope_run: rollout-42
scope_channel: staging
updated: 2026-10-18
---

Mira's request is to raise pool.limit from 8 to 12 in staging after reviewing the connection-pressure trace. The trace showed workers waiting for slots while the database stayed below its connection ceiling. This note records the request and the rationale only: no configuration edit, deployment or production change was performed. Approval and a staging rollout are still pending.
