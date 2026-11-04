---
description: The font system uses a Registry struct mapping family names to
  []Face, with a LoadDir method that scans a directory for .ttf/.otf files and
  registers them.
evidence: Agent's implementation at 2026-09-22T10:48:31Z and user's initial
  request at 2026-09-22T10:48:25Z.
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

- `internal/fonts/registry.go` defines `type Registry struct { faces map[string][]Face }` with an `Add(f Face)` method.
- `internal/fonts/load.go` provides `func (r *Registry) LoadDir(dir string) error` to iterate over a directory, filter `.ttf` and `.otf` extensions, and call `ParseFile` on each.
- `cmd/quill/render.go` adds a `--font-dir` flag to pass the directory path to `LoadDir`.
