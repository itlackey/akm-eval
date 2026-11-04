---
description: "Handling the undocumented unit shift in Ledgerline's legacy payment export."
---

On March first, 2025, the Ledgerline platform altered how the Amount field is recorded, moving from integer-based cents to decimal-based dollars. This change was not announced, creating a critical issue for the file located at `data/legacy_payments.csv`. Any entry with a timestamp earlier than `2025-03-01` retains its original cent value, while subsequent records reflect dollar amounts. Consequently, aggregating these figures directly leads to severe calculation errors and validation failures against financial ledgers. To resolve this, your cleaning routine must inspect each row's date. If the date precedes the cutoff, divide the value by one hundred. Ensure this logic is explicitly commented within your script to maintain clarity for future developers. Ignoring this conditional transformation will result in inaccurate financial reporting.
