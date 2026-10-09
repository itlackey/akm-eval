---
description: The size and retention settings of a service message queue.
tags: [queue, settings]
---

# Service queue settings

The orders queue holds at most 20000 messages. Messages expire after 4 days. A message can be at most 64 KB. Messages that fail 5 times go to the dead-letter queue. The owner of the queue is named in the service catalog. The depth of the queue is shown on the platform dashboard. An alert fires when the queue stays above 80 percent full for 10 minutes. Changes to the queue settings need a review from the platform team.
