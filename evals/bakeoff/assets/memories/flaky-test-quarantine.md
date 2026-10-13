---
description: Quarantine rule for flaky integration tests.
updated: 2026-04-21
---

A test that fails and then passes on retry is tagged `@quarantine` and moves
from the blocking `ci-integration` job to the non-blocking `nightly-quarantine`
job. Quarantined tests never gate a merge, and the owning team fixes or
deletes them within five working days.
