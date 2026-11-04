---
description: "harborlight error-format work on 2026-10-14: fail() helper merged, Commander usage errors still exit 1."
evidence: "Agent's run of `harbor moor --bogus` at 2026-10-14T11:02:40Z."
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:18:02.721Z
verified:
  - by: human:user
    at: 2026-11-04T01:18:02.721Z
provenance:
  sources:
    - resource: claude:preference-11
---

Status of the harborlight error convention work on 2026-10-14. The `fail(message, code)` helper in `src/util/tty.ts` is merged and used by moor and unmoor. The Commander overrides are not in yet: `harbor moor --bogus` still prints `error: unknown option` without the `harbor: ` prefix and exits 1 instead of 2. Ticket HBL-431 tracks the rest; 3 of its 5 tasks are done.
