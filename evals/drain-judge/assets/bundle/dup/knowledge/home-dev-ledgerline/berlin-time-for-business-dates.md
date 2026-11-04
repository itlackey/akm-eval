---
description: "Ledgerline business figures use Berlin time for date boundaries."
---

Churn, revenue and other business figures are reported in Europe/Berlin time, not UTC. In queries on `customers` or `invoices`, write each boundary as `timestamptz 'YYYY-MM-DD 00:00 Europe/Berlin'` so a day or month starts at Berlin midnight; with the default UTC reading, rows near midnight fall on the wrong day.
