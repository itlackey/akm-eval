---
description: "Pin TZ=UTC in the test script so date tests agree between laptops and CI."
---

A date test can pass on laptops and fail in CI because the function formats in local time: `2026-09-30T23:30:00Z` is already 1 October in Europe/Lisbon in summer but 30 September in UTC, where CI runs. Setting `TZ=UTC` for the test script in `package.json` makes both agree; the expected value is 30 September.
