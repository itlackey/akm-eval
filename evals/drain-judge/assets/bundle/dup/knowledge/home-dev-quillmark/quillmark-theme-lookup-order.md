---
description: "Where quillmark looks for a theme given with -theme."
---

For `-theme <name>`, quillmark takes the first file it finds among: `./themes/<name>.toml` beside the document; then `~/.config/quillmark/themes/<name>.toml`, or the same under `$XDG_CONFIG_HOME/quillmark/themes`; then the built-ins paper, ink and sepia. So a custom theme named like a built-in wins over it.
