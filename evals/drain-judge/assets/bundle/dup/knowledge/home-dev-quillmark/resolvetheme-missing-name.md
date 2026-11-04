---
description: "ResolveTheme gives an empty Theme for an unknown name instead of the default."
---

`ResolveTheme` (`internal/render/theme.go`) has no fallback: for a name the themes map does not hold it returns the zero `Theme{}`, and rendering further on fails without an error. Returning `themes[DefaultThemeName]` instead fixes it.
