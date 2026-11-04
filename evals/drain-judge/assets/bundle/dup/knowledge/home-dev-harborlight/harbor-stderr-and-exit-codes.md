---
description: "How harborlight reports errors: a harbor: prefix on stderr, exit 1 at runtime, exit 2 for usage."
---

Errors from the harborlight CLI go to stderr starting with `harbor: `. Failures at runtime call `fail(message, code)` from `src/util/tty.ts` and exit 1. For usage mistakes the program overrides Commander: `configureOutput` writes `harbor: ` plus the message without its `error: ` lead, and `exitOverride` turns any non-zero exit into 2.
