---
description: ResolveTheme in internal/render/theme.go returns an empty Theme{}
  struct when a requested theme name is not found in the map, rather than
  falling back to a default.
evidence: Agent's fix at 2026-09-28T21:10:26Z
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

The theme resolution logic in internal/render/theme.go lacks a fallback mechanism. When ResolveTheme is called with a name absent from the themes map, it returns a zero-value Theme{}. This causes silent failures in downstream rendering logic that expect valid theme data. The fix is to return themes[DefaultThemeName] instead.
