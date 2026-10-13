---
description: "A migration that added an index to the orders table blocked checkout writes for nine minutes; CONCURRENTLY avoids that."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-08
---
The release migration that added an index on `orders.created_at` ran `CREATE
INDEX` on the production orders table, which holds about 80 million rows.
Postgres held a lock that blocked inserts and updates on the table until the
index was built, so checkout requests queued and timed out for nine minutes.
The index was later rebuilt in a test copy with `CREATE INDEX CONCURRENTLY`,
which let writes continue while it built and took about 25 minutes.
`CONCURRENTLY` cannot run inside a transaction, so the migration file now turns
off the migration tool's transaction wrapper for that one step.
