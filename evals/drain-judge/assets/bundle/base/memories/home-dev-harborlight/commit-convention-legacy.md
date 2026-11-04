---
description: "Retired legacy commit convention for harborlight"
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

Prior to March 15, 2026, the harborlight repository utilized a relaxed commit message style that allowed free-form subjects and optional ticket references. This approach led to inconsistent history and made automated changelog generation unreliable. The team officially retired this method on March 15, 2026, in favor of the strict Conventional Commits specification. The new standard enforces a rigid `type(scope): subject` format with imperative mood, lowercase characters, and a maximum length of 60 characters. It also mandates a `Refs:` footer for ticket linkage. This note is preserved solely for historical reference to document the transition away from the informal practice. Developers should no longer use the old style, as it is no longer supported by the CI/CD pipeline validation checks. Understanding this change helps explain current commit restrictions and the rationale behind the enforced structure.
