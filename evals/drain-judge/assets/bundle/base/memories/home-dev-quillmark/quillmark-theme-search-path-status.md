---
description: "Status update on Quillmark theme resolution priority bug"
evidence: agent running `go run ./cmd/quill themes list -v` at
  ts=2026-10-10T14:00:11Z and documenting at ts=2026-10-10T14:00:21Z
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:19:54.095Z
verified:
  - by: human:user
    at: 2026-11-04T01:19:54.095Z
provenance:
  sources:
    - resource: claude:buried-08
---

## Status Report: Theme Override Logic

**Date:** November 14, 2026
**Ticket:** QM-492
**Status:** Blocked

Work on the theme resolution priority is currently stalled. The recent commit `a3f9b2c` attempted to enforce strict precedence for user-defined themes over built-ins, but integration tests failed due to a race condition in the config loader.

The issue is that `./themes/<name>.toml` is not consistently overriding `~/.config/quillmark/themes/<name>.toml` in edge cases involving symlinked directories. We are waiting on @jdoe to review the proposed fix in PR #881, which refactors the search path to use absolute paths before comparison.

Until this is merged, the fallback to built-ins like `paper` remains unpredictable for users with conflicting local and global theme files. No further development can proceed on related UI components until the core resolution logic is stabilized. Estimated resolution: November 20, 2026, pending review turnaround.
