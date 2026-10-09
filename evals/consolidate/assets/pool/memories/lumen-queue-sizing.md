---
description: How the Lumen work queues are sized.
tags: [queue, capacity]
---

# Lumen queue sizing

Each Lumen work queue holds at most 50000 messages. A queue above 80 percent full raises a warning. The queue depth is exported as the metric lumen_queue_depth. Consumers are scaled between 2 and 12 pods by the queue depth. Scaling decisions are taken every 30 seconds. A queue that stays full for 10 minutes starts dropping the oldest messages.
