---
description: How the Tavistock gateway retries failed calls.
tags: [gateway, retries]
---

# Tavistock retry budget

The Tavistock gateway retries a failed call up to 3 times. Retries wait 200 milliseconds and then double. Only idempotent calls are retried. A call that took longer than 8 seconds is not retried. Retries are counted in the metric tv_retries_total. The retry budget is 10 percent of the calls in a minute. A circuit opens after 20 failures in a row.
