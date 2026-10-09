---
description: How long Fenwick keeps each kind of log and where they are searched.
tags: [logs, retention]
---

# Fenwick log retention

Fenwick application logs are kept for 30 days in the hot index. After 30 days they move to cold storage in the bucket fenwick-logs-cold for 11 more months. Audit logs are never moved and are kept for 7 years. Debug level logs are dropped after 3 days. Logs are searched with the saved views in the Fenwick console. A request id is attached to every line, in the field req_id. Logs that contain a card number are dropped at the collector.
