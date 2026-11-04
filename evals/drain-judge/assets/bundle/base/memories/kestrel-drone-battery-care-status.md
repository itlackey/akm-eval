---
description: "Status report on Kestrel drone battery maintenance protocols as of late October 2026."
tags: [drones, batteries]
---

## Kestrel Battery Maintenance Status

**Date:** October 24, 2026
**Build:** v4.2.1

Current operations are running on the stable v4.2.1 build. The standard protocol remains: store batteries at 50% charge and enforce a 20-minute cool-down post-flight. However, recent thermal anomalies in Batch 7 have triggered an immediate audit.

**Pending Actions:**
- Investigating swelling reports linked to commit `a3f9c2b`. 
- Safety Officer has been notified of three units requiring disposal in the fireproof bag.
- Cycle log updates are lagging; manual reconciliation is required for units exceeding 250 cycles.

**Retirement Threshold:**
Strict enforcement of the 300-cycle retirement rule is now mandatory. Any unit approaching 280 cycles must be pulled for inspection. Do not extend flight time beyond approved limits. Awaiting firmware patch `b8e1d4c` to improve charge monitoring accuracy before resuming full operational tempo.
