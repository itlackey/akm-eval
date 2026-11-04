---
description: "Add indexes to large live Postgres tables with CREATE INDEX CONCURRENTLY, outside a transaction."
---

A plain `CREATE INDEX` on the 80-million-row orders table locked out inserts and updates until it finished, and checkout timed out for nine minutes. `CREATE INDEX CONCURRENTLY` lets writes go on (it took about 25 minutes). It cannot run in a transaction, so turn off the migration tool's wrapper for that step.
