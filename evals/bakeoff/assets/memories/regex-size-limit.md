---
description: Regex compile limits in the lint rules crate.
updated: 2026-05-12
---

The lint rules crate compiles user patterns with `RegexBuilder::size_limit(8 * (1 << 20))`. A pattern over that limit returns `Error::CompiledTooBig`, and the rule loader reports the rule id instead of aborting. The regex crate has no lookaround or backreferences, so rules that need them live in `rules/legacy/` and use `fancy-regex`.
