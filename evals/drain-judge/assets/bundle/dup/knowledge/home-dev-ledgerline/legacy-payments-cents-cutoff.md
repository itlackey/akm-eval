---
description: "Amounts in legacy_payments.csv switch from cents to dollars on 2025-03-01."
---

In `data/legacy_payments.csv`, the vendor changed the Amount unit without saying so: rows before 2025-03-01 are cents (whole numbers), rows from that day on are dollars (with decimals). Summing them unconverted gives totals far off Finance's. The cleaning script divides the earlier rows by 100, with a comment at the cutoff.
