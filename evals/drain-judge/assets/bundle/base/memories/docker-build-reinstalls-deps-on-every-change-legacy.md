---
description: "Documenting the retired approach of copying the entire source tree before dependency installation."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-28
---

## Retired: Full Source Copy Before npm ci

**Status:** Retired on 2026-03-15

Previously, the Kestrel API Dockerfile utilized a `COPY . .` command prior to `RUN npm ci`. This approach forced a complete dependency reinstall for every code change, resulting in build times of approximately six minutes. The method was inefficient because it invalidated the layer cache unnecessarily.

This approach has been replaced by the **Layered Dependency Installation** strategy. This new method copies only `package.json` and `package-lock.json` first, runs `npm ci`, and then copies the source code. This optimization reduced code-only rebuild times to roughly 40 seconds. This note is retained solely for historical reference to explain the rationale behind the current build configuration.
