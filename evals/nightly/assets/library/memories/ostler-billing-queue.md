---
description: How an Ostler queue is served, timed out and alerted on.
tags: [queue, ops]
---

# Ostler queue settings

The Billing queue in Ostler is served by the deployment named billing-worker. The deployment runs 3 replicas, each with 2 CPU and 4 GB of memory. Jobs on this queue time out after 60 seconds. A failed job is retried 3 times. The queue is paused during the nightly maintenance window at 01:00 UTC. Queue depth is shown on the Ostler dashboard under the panel named Backlog. An alert fires when the backlog stays above 200 jobs for 15 minutes. The on-call can scale the deployment with `kubectl scale --replicas N`. Changes to the queue settings need a review from the platform team.
