---
description: "The harborlight repository enforces a strict conventional commit
  format: type(scope): subject (imperative, lowercase, ≤60 chars), with a Refs:
  footer for tickets."
evidence: User's explicit instruction at 2026-09-23T13:23:30.000Z after the
  agent's initial non-conventional commit.
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:11:21.156Z
verified:
  - by: human:user
    at: 2026-11-04T01:11:21.156Z
provenance:
  sources:
    - resource: claude:preference-01
---

The harborlight project mandates conventional commits with the following rules:
- Format: `type(scope): subject`
- Subject must be imperative mood, lowercase, and ≤60 characters.
- No trailing period.
- Include a `Refs: <TICKET>` footer on its own line when the branch or task references a ticket (e.g., `Refs: HBL-417`).
- Apply this convention consistently across all commits, not just feature branches.
