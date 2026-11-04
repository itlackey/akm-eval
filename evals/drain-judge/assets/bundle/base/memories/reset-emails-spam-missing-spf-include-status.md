---
description: "Investigation into Quarry app email deliverability issues post-migration."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-04
---

2026-10-15 STATUS REPORT: Incident #4921 regarding Quarry app password reset emails landing in spam folders persists despite initial SPF fixes. We have ruled out DKIM misconfiguration and DMARC policy failures; signatures are valid and aligned. The issue appears isolated to two major providers who are aggressively filtering based on recent sending volume anomalies from the new provider. We are currently testing a gradual warm-up strategy, increasing daily send limits by 10% increments. Commit `a3f9c2b` updated the sending quotas, but logs show intermittent 550 errors during peak hours. Next, we will implement a dedicated IP pool for transactional mail to isolate reputation impact. Monitoring continues for any bounce rate spikes above 2%.
