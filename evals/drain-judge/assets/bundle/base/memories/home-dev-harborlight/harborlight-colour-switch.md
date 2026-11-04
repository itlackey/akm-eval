---
description: "harborlight's old colour switch: a global chalk.level setting in cli.ts, removed when the tty helper came in."
evidence: "User's explanation at 10:51:30 of how colour was handled before the tty helper."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:18:02.755Z
verified:
  - by: human:user
    at: 2026-11-04T01:18:02.755Z
provenance:
  sources:
    - resource: claude:preference-11
---

Before `src/util/tty.ts` existed, harborlight turned colour off by setting `chalk.level = 0` in `cli.ts` when `--no-color` was passed, and each command called chalk directly. Piped output and `NO_COLOR` were not checked. This was retired when the `paint()` wrapper was added, and the `--no-color` handling in `cli.ts` was deleted with it.
