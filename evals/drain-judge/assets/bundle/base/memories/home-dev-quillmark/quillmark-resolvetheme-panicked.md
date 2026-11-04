---
description: "quillmark's ResolveTheme once panicked on an unknown theme name; the panic was taken out."
evidence: "Agent's reading of the history of theme.go at 2026-09-28T21:08:02Z."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:11:56.502Z
verified:
  - by: human:user
    at: 2026-11-04T01:11:56.502Z
provenance:
  sources:
    - resource: claude:preference-03
---

Before September 2026, `ResolveTheme` in `internal/render/theme.go` panicked with `unknown theme` when the name was missing from the map, and `cmd/quill` recovered the panic to print an error. The panic and the recover were removed in 2026, replaced by a plain map lookup.
