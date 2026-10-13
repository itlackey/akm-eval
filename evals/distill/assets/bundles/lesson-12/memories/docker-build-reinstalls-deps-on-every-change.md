---
description: "The Kestrel API image took six minutes to build after any code change because the source was copied before npm ci."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-28
---
Every build of the Kestrel API image took about six minutes, even for a
one-line change. The Dockerfile copied the whole source tree with `COPY . .`
before `RUN npm ci`, so any change to any file invalidated the layer cache and
all dependencies were installed again. Copying `package.json` and
`package-lock.json` first, running `npm ci`, and only then copying the rest of
the source brought a code-only rebuild down to about 40 seconds. A change to
the lockfile still reinstalls everything, as it should.
