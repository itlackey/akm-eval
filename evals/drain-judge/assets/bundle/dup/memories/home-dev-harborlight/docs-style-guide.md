---
description: "Project documentation conventions discovered mid-session: British
  spelling, sentence case headings, no filler words, and second-person address."
evidence: User's style correction at 2026-09-19T13:38:24Z and follow-up at
  2026-09-19T13:39:03Z
type: memory
updated: 2026-11-03
generated:
  by: akm/0.10.261105
  at: 2026-11-04T01:16:22.173Z
verified:
  - by: human:user
    at: 2026-11-04T01:16:22.173Z
provenance:
  sources:
    - resource: claude:preference-05
---

When writing or editing documentation under `docs/` in the `harborlight` project, adhere to the following style rules:

- **Spelling:** Use British English (e.g., `colour`, `behaviour`, `customise`, `licence`).
- **Headings:** Use sentence case (e.g., `Mooring a vessel`, not `Mooring a Vessel`).
- **Prohibited words:** Never use `simply`, `just`, `easy`, or `easily`.
- **Address:** Always address the reader as `you`.
- **CLI flags vs prose:** Keep CLI flag names exactly as defined in the source code (even if they use American spelling like `--color`), but use the project's British spelling in the surrounding prose.

These rules were explicitly mandated by the user to align with existing documentation like `docs/guide/status.md`.
