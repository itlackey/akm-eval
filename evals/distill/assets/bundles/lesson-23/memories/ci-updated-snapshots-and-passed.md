---
description: "The web client's snapshot tests passed in CI for three weeks with a broken header, because the CI script ran jest -u."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-03
---
A broken header layout in the web client went unnoticed for three weeks
although it had snapshot tests. The CI script ran `jest -u`, which rewrites
every snapshot that no longer matches, so the snapshot tests could not fail in
CI; the rewritten snapshots were thrown away with the job. Removing `-u` and
running `jest --ci`, which also fails on a snapshot that does not exist yet
instead of writing it, made the next run fail on the header, as it should have.
Snapshots are now only updated on a developer machine and reviewed in the pull
request.
