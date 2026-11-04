---
description: "The harborlight CLI enforces a strict error convention: stderr
  output must be prefixed with `harbor: `, exit code 1 for runtime errors, and
  exit code 2 for usage errors."
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

Runtime errors should use the `fail(message, code)` helper from `src/util/tty.ts`. For usage errors (e.g., missing required arguments), Commander.js defaults must be overridden. Apply `.configureOutput({ writeErr: (s) => process.stderr.write(`harbor: ${s.replace(/^error: /, "")}`) })` and `.exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : 2))` to the program instance. This ensures consistent error formatting and correct exit codes across all commands without relying on Commander's built-in behavior.
