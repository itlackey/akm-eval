---
description: "Retired approach for harborlight CLI error handling using Commander.js defaults."
evidence: User correction at 10:52:44; fix applied to cli.ts at 10:53:34.
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

Prior to March 15, 2026, the harborlight CLI managed errors by relying on Commander.js's default output behavior, which was inconsistent and difficult to maintain. We manually patched stderr in various command handlers to prepend `harbor: `, leading to fragmented code and occasional exit code mismatches. This approach was retired on March 15, 2026, due to its fragility and the high maintenance burden of scattered error formatting logic. It was replaced by the `StrictErrorConvention` approach, which centralizes error handling through the `fail()` helper in `src/util/tty.ts` and standardized Commander.js configuration. This note is retained solely for historical reference to document the evolution of our CLI's error management strategy and to prevent re-adoption of the outdated pattern.
