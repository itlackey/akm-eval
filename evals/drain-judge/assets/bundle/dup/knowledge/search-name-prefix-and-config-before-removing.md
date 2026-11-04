---
description: "Before removing a function whose name follows a pattern, search configs and the name prefix."
---

Deleting `export_legacy_csv` passed a code search and the tests, then the nightly job died with `KeyError`: it looks up `handlers[f"export_{fmt}"]` at runtime and production config still had `fmt: legacy_csv`. For pattern-named functions, search for the prefix and in config files too.
