---
description: "A stalled payment API held all 64 checkout threads for 12 minutes, because the requests library has no default timeout."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-26
---
When the payment provider's API stalled for 12 minutes, every one of the 64
worker threads of the checkout service ended up waiting on it, and checkout
stopped answering. The calls used the Python requests library without a timeout
argument, and requests has no default timeout, so a call waits as long as the
server keeps the connection open. Passing `timeout=(3, 10)` to every call
bounds the wait at 3 seconds to connect and 10 to read.
