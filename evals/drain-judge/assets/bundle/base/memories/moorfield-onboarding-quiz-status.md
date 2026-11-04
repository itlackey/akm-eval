---
description: "Status report on the Moorfield safety quiz rollout as of late October 2026."
tags: [workshop, safety]
---

As of October 28, 2026, the new Moorfield safety quiz implementation is currently in the staging environment. The rollout to the production environment has been paused pending final review by the Safety Compliance Board. Currently, 0% of live users are affected by this update.

The previous commit, `a7f3b2c`, introduced the 20-question logic and the 18-point pass threshold, but integration tests revealed a latency issue with the access card recording service. Engineering has identified the bottleneck in the card reader API and is working on a fix. No approval has been granted for production deployment yet. We expect to re-evaluate the rollout timeline next week once the latency issue is resolved and the staging environment passes all regression tests. The spring review cycle for question content remains unaffected by this technical delay.
