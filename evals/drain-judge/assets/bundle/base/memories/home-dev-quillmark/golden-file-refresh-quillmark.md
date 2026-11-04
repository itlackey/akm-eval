---
description: "Golden file refresh in quillmark on 2026-09-30: 12 of 31 regenerated, the rest wait on the renderer fix."
evidence: "Agent's go test -update run at 2026-09-30T15:40:02Z."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:17:24.138Z
verified:
  - by: human:user
    at: 2026-11-04T01:17:24.138Z
provenance:
  sources:
    - resource: claude:preference-09
---

Golden files, 2026-09-30: after the line-height change, 31 files in `internal/render/testdata` differ. 12 have been regenerated with `go test -update` and checked with `git diff`. The other 19 wait on the fix for widow control, since regenerating them now would bake in the bug. The branch is `line-height`, not pushed.
