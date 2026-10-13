---
tags: [database, migration]
---

Before a migration adds a NOT NULL column to a large table, add the column as
nullable, backfill it in batches of 10,000 rows, and only then add the NOT
NULL constraint in a separate migration.
