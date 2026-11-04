---
description: "ResolveTheme fallback fix on 2026-09-28: patch on the working tree, two tests still expect the empty Theme."
evidence: "Agent's test run at 2026-09-28T21:12:40Z."
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

ResolveTheme fix, 2026-09-28: `internal/render/theme.go` now returns `themes[DefaultThemeName]` for an unknown name. Two tests in `theme_test.go` still assert the old empty `Theme{}` and fail; they are being updated. The change is on the working tree only.
