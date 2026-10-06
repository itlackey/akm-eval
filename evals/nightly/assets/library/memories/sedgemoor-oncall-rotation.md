---
description: How the Sedgemoor on-call rotation runs and what is expected of the on-call.
tags: [oncall, process]
---

# Sedgemoor on-call rotation

The Sedgemoor on-call rotation changes every Monday at 09:00 UTC. The schedule lives in the paging service, not in a file. The primary on-call carries the pager for the week. The secondary is paged only when the primary does not acknowledge in 15 minutes. Swaps are made in the paging service at least a day ahead. On-call weeks are capped at one in every four for each engineer. A new on-call reads the handover note in `docs/oncall/handover.md`. The on-call is expected to acknowledge a page within 5 minutes.
