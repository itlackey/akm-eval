---
description: "Kestrel API build times on 2026-07-27: six minutes per build, Dockerfile change in review."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-27
---

Kestrel API image, 2026-07-27: every build takes about six minutes, even for a one-line change, and CI queues are backing up. A Dockerfile change that copies the package files before `npm ci` is in PR 212, waiting for a second review. Builds stay slow until it merges.
