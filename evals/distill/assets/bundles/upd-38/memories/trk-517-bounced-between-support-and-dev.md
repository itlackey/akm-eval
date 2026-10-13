---
description: "TRK-517 went back and forth between support and the developers for nine days because it had no steps to reproduce."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-10-09
---
TRK-517, a report that invoices sometimes printed without a total, went back
and forth between support and the developers three times over nine days,
because nobody could make it happen. When the customer's steps were finally
written down, it took ten minutes to see: it happens only for an invoice edited
after its discount was removed. The ticket template has a steps field, but it
is optional, and support had left it empty.
