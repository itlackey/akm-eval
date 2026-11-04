---
description: "quillmark's old font handling: a fixed list of three embedded fonts in fonts.go."
evidence: "User's initial request at 2026-09-22T10:48:25Z, which described the old font list."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:16:41.458Z
verified:
  - by: human:user
    at: 2026-11-04T01:16:41.458Z
provenance:
  sources:
    - resource: claude:preference-06
---

quillmark used to know only three fonts, embedded with `go:embed` and listed in a switch in `internal/fonts/fonts.go`; a family name not in the switch fell back to the first one. That list was replaced in September 2026 by the font Registry, and `fonts.go` was deleted.
