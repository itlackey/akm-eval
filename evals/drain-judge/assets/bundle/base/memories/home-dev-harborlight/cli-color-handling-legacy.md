---
description: "Retired direct chalk usage in harborlight commands before adopting TTY-aware wrappers."
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

Prior to March 15, 2026, the harborlight team directly imported and invoked `chalk` functions within command handlers. This approach allowed for immediate color application but failed to respect environment variables like `NO_COLOR` or handle piped stdout correctly, leading to ANSI escape codes appearing in logs where they were unwanted.

This method was officially retired on March 15, 2026. The team replaced it with the `paint` utility from `src/util/tty.ts`. This new approach ensures that color codes are conditionally applied based on the terminal's capabilities and environment settings. All existing commands were refactored to use `paint(chalk.fn, msg)` instead of direct chalk calls, ensuring consistent and compliant output behavior across all execution contexts. This note is retained for historical reference only.
