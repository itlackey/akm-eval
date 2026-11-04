---
description: "quillmark font registry on 2026-09-22: Registry and LoadDir written, --font-dir flag not wired yet."
evidence: "Agent's implementation at 2026-09-22T10:48:31Z."
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

Font registry, 2026-09-22: `internal/fonts/registry.go` and `load.go` are written and their tests pass. The `--font-dir` flag in `cmd/quill/render.go` is declared but not yet passed to `LoadDir`, so rendering still uses only the built-in fonts. Next: wire the flag and add a test with a .otf file.
