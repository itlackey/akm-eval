---
description: "Ledgerline's old region fix-up, a nightly job that rewrote CRM Region values, has been switched off."
evidence: "User correction at ts=08:49:54, which ended the old job."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:37.578Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:37.578Z
provenance:
  sources:
    - resource: claude:buried-07
---

Ledgerline used to run `fix_regions.py` nightly against the CRM export: it trimmed the Region column and rewrote a few known misspellings before the reports ran. The job was switched off in October 2026, when regional reports moved to the ledger's billing_country, and its cron entry was removed.
