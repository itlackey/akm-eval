---
description: Partition filter rule for the page events warehouse table.
updated: 2026-04-03
---

Every query on `analytics.page_events` must filter on `event_date`; the
warehouse refuses a full scan of that table. Reports that need more than 90
days of history read the `page_events_daily` rollup instead.
