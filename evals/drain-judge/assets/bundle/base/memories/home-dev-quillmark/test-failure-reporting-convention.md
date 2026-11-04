---
description: "Project convention for reporting test failures: only list failing
  test names and their first assertion error, followed by the command run. Omit
  explanations, emojis, and headings."
evidence: User correction at 2026-09-28T21:09:36Z
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:11:56.463Z
verified:
  - by: human:user
    at: 2026-11-04T01:11:56.463Z
provenance:
  sources:
    - resource: claude:preference-03
---

During this session, the user explicitly corrected the agent's verbose test failure reporting style. The established project convention requires listing only the failing test name and its first assertion error, followed by the executed command on the last line. All extra text, emojis, headings, and explanations must be omitted. Adhering to this format ensures concise, machine-readable output that aligns with the project's workflow and avoids unnecessary verbosity.
