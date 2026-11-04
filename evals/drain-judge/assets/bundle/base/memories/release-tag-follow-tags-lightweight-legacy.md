---
description: "Retired approach for creating release tags using lightweight tags"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-27
---

## Retired: Lightweight Tag Push Strategy

**Status:** Retired on 2026-03-15

Previously, the team relied on `git push origin main --follow-tags` to automatically push release tags. This approach failed because the command only pushes annotated tags, leaving lightweight tags local. Consequently, CI/CD pipelines triggered by tag events would not execute, causing silent release failures.

**Replacement:** We now mandate the use of annotated tags via `git tag -a <version> -m "Release <version>"` before pushing. This ensures the tag metadata is included in the push, guaranteeing the release workflow triggers immediately. This note is retained for historical context regarding past automation gaps.
