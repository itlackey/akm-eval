---
description: This repo enforces a strict, highly concise PR review format to
  avoid verbosity and keep feedback scannable.
evidence: User correction at 09:06:45
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:17:09.389Z
verified:
  - by: human:user
    at: 2026-11-04T01:17:09.389Z
provenance:
  sources:
    - resource: claude:preference-08
---

When reviewing PRs in this codebase, follow this exact structure:

- One finding per line
- Format: `path:line severity: problem and fix in one sentence.`
- Severity levels: `blocker`, `major`, `nit`
- Order: Blockers first, then major, then nits
- Omit: summaries, praise, and restatements of what the PR does

This convention keeps reviews fast and actionable.
