---
description: Detailed observation of read-replica lag during failover drills.
updated: 2026-05-27
---

Three failover drills measured read-replica lag under write load. It stayed
below one second normally but reached 40 seconds during the nightly batch
import, and a user served from a replica right after saving a form saw the
old values.

The durable rule: a request that reads its own writes sends those reads to the
primary; other reads may use a replica. Every drill agreed, so this is a
stable property of the replica set and belongs in the shared knowledge base.
