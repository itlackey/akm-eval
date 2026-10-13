---
description: "The next billing date test failed only on 31 August, when adding a month gave 1 October; vi.setSystemTime now pins the date."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-01
---
The `nextBillingDate` test failed in the nightly run on 31 August and passed on
every other night that month. It added one month to the real current date with
`setMonth`, and from 31 August that gives 1 October, because September has no
31st. Freezing the clock with `vi.setSystemTime` at 15 June made the test the
same every day, and a second test now pins 31 August on purpose.
