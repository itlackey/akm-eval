---
description: "The Kestrel API image was once built in one stage from node:18 with npm install."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-28
---

The Kestrel API image used to be built from `node:18` in one stage, running `npm install` and shipping the dev dependencies, for an image of about 1.2 GB. That Dockerfile was retired in 2026 for a multi-stage build on `node:20-slim`.
