---
description: How the Ostler worker retries failed jobs and where dead jobs go.
tags: [queue, retries]
---

# Ostler retry policy

The Ostler worker retries a failed job 5 times with exponential backoff that starts at 2 seconds. After the fifth failure the job moves to the dead-letter queue named jobs-dead. The retry limit comes from the OSTLER_MAX_RETRIES variable. Jobs older than 24 hours are dropped instead of retried. A dead job can be replayed with `jobq replay --queue jobs-dead`. Every retry is logged at warn level together with the job id. The nightly report at 03:00 UTC lists what is sitting in the dead-letter queue.
