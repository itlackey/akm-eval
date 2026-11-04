---
description: Quillmark resolves custom themes by searching three locations in
  order before falling back to built-ins.
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

When a user passes `-theme <name>`, Quillmark looks for the theme file in this order and uses the first match:
1. `./themes/<name>.toml` (next to the document being rendered)
2. `~/.config/quillmark/themes/<name>.toml` (or under `$XDG_CONFIG_HOME/quillmark/themes`)
3. The built-in themes (`paper`, `ink`, `sepia`)

A custom file with the same name as a built-in theme will override it.
