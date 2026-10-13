---
description: "The Docker build of the Sorrel CLI broke when a transitive dependency's minor release dropped Node 16; there was no lockfile."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-21
---
The Docker build of the Sorrel CLI broke one morning with no change in the
repository. It installed dependencies without a lockfile, and a transitive
dependency had published a minor release overnight that dropped support for
Node 16, which the image uses. Generating and committing `package-lock.json`
and switching the build to `npm ci` made it pass again with the versions from
the day before.
