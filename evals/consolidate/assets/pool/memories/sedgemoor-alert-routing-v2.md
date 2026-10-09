---
description: Where Sedgemoor alerts are sent.
tags: [alerts, routing]
---

# Sedgemoor alert routing

Sedgemoor critical alerts page the platform on-call. Warnings go to the channel #sedgemoor-alerts and do not page. An alert that is not acknowledged in 5 minutes is now escalated to the team lead, shortened from 15 minutes. Alerts are grouped by service for 2 minutes before they are sent. A maintenance window silences all alerts of a service. The routing rules live in the file routes.yaml. Every page is reviewed in the weekly operations meeting.
