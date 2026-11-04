---
description: "Overview of the font registry architecture and CLI integration for loading typefaces."
---

The application manages typography through a central registry that associates typeface names with their corresponding face data structures. This core component resides in `internal/fonts/registry.go`, where the `Registry` type holds a map linking string identifiers to slices of `Face` objects. Developers can populate this collection by invoking the `Add` method, which accepts a single face instance. To automate discovery, the `internal/fonts/load.go` module exposes a `LoadDir` function attached to the registry receiver. This routine traverses the specified file path, identifies files ending in `.ttf` or `.otf`, and processes them via `ParseFile`. Finally, the command-line interface in `cmd/quill/render.go` exposes a `--font-dir` argument. Users supply the target directory path through this flag, which is then forwarded to the loading mechanism to initialize the font system.
