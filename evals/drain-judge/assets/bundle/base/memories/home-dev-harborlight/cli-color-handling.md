---
description: Never call chalk directly in harborlight commands. Always wrap
  stdout strings in `paint(chalk.fn, msg)` from `src/util/tty.ts`.
evidence: User correction at 10:52:44; applied to moor.ts and unmoor.ts at 10:53:08.
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

`src/util/tty.ts` provides `useColor()` and `paint(fn, s)` to conditionally apply chalk styles. This ensures colors are automatically stripped when stdout is piped or when the `NO_COLOR` environment variable is set. Commands should import `paint` and use it for all colored console output to maintain compliance with the project's TTY-aware output standards.
