---
description: "Copy package.json and the lockfile before npm ci so code changes reuse the dependency layer."
---

With `COPY . .` before `RUN npm ci`, any file change invalidates the cache and every dependency installs again; the Kestrel API took six minutes per build. Copy `package.json` and `package-lock.json`, run `npm ci`, then copy the source: code-only rebuilds drop to about 40 seconds, and a lockfile change still reinstalls.
