---
description: "Never run jest -u in CI; it hides every snapshot failure."
---

In CI, `jest -u` rewrites any snapshot that does not match, so snapshot tests there can never fail; a broken header in the web client went unseen for three weeks that way. Run `jest --ci`, which also fails when a snapshot is missing. Update snapshots on a developer machine and review them in the pull request.
