---
description: Standing warehouse convention for timestamp columns.
updated: 2026-03-30
---

Every timestamp column in the warehouse is stored in UTC, and conversion to a
viewer's time zone happens only in the BI layer. The convention applies to
every model, old and new, and is meant as shared reference knowledge for anyone
who writes SQL against the warehouse.
