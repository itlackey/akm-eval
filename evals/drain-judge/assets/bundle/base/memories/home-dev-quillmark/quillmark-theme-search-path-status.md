---
description: "quillmark theme loading on macOS, 2026-10-10: XDG path not read yet, issue #57 open."
evidence: "agent running `go run ./cmd/quill themes list -v` at ts=2026-10-10T14:00:11Z"
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

On 2026-10-10, `quill themes list -v` on a Mac did not show themes under `$XDG_CONFIG_HOME/quillmark/themes`, only `~/.config/quillmark/themes`. Issue #57 is open and assigned; a fix is on branch `xdg-themes` with one failing test. Until it is merged, Mac users put their themes in `~/.config/quillmark/themes`.
