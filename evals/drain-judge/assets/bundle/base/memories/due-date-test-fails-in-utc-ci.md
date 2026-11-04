---
description: "A due-date test passed on laptops and failed in CI, because CI runs in UTC and the function formats in local time."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-30
---
The `formatDueDate` test passed on every laptop on the team and failed in CI,
where it printed 30 September instead of 1 October. Its input was the timestamp
`2026-09-30T23:30:00Z`, and the function formats in local time. The laptops are
set to Europe/Lisbon, an hour ahead of UTC in summer, so there the timestamp is
already 1 October; the CI containers run in UTC. Setting `TZ=UTC` for the test
script in `package.json` made laptops and CI agree, and the expected value was
corrected to 30 September.
