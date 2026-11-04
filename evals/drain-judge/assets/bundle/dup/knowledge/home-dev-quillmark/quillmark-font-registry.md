---
description: "How quillmark registers fonts."
---

Fonts live in a `Registry` (`internal/fonts/registry.go`) holding `faces map[string][]Face`, filled by `Add(f Face)`. `LoadDir(dir string) error`, in `internal/fonts/load.go`, walks a folder and passes each `.ttf` or `.otf` file to `ParseFile`. `cmd/quill/render.go` exposes it as the `--font-dir` flag.
