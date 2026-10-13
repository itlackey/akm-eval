---
description: "Take a fresh backup of the database right before running a migration, so a bad migration can be undone."
when_to_use: "When running a schema or data migration on a production database."
type: lesson
tags:
  - ops
  - database
updated: 2026-09-08
---

Take a fresh backup of the database right before running a migration.
A migration that goes wrong can only be undone from a backup taken just before it.
