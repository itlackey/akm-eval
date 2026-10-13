---
description: "The customer export failed for three customers whose surnames have an apostrophe, because the name was formatted into the SQL."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-17
---
The nightly customer export failed with a syntax error on three customers, all
with an apostrophe in their surname, such as O'Rourke. The query was built with
an f-string, so the apostrophe ended the quoted value early. Passing the name
as a query parameter fixed the export, and a search of the code found four more
queries built the same way, which were changed too.
