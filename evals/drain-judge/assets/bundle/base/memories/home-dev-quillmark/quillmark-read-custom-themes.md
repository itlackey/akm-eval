---
description: "quillmark once read custom themes only from a themes_dir setting in quill.toml."
evidence: "agent's look at the old config loader at ts=2026-10-10T13:58:40Z"
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

Earlier quillmark versions loaded custom themes only from the folder named by `themes_dir` in `quill.toml`, and a theme with a built-in's name was refused. The `themes_dir` setting was removed in 2026 when themes moved to a search path.
