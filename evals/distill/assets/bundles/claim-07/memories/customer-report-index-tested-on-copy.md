---
description: "An index on orders.customer_id cut the customer report from 14 s to 0.9 s on a restored copy; its cost on writes was not measured."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-01
---
The customer report query took 14 seconds. On a copy of the production database
restored on 2026-08-30, adding an index on `orders.customer_id` brought it down
to 0.9 seconds. The copy had no live traffic, so the cost of the index on
inserts and updates was not measured, and production does not have the index
yet. Only the customer report was timed; the other reports that read the orders
table were not run against the copy.
