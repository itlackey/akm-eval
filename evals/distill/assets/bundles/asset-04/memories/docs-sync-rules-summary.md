---
description: "The rules followed when syncing documentation after a refactoring slice."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-15
---
Rules followed when updating the docs after a refactoring slice. Start only
when the implementation is stable, and never document behaviour that does not
exist yet. Classify each reference as current, stale, generated, historical or
out of scope. Do not hand-edit generated docs; regenerate them with the tool
that owns them. Keep examples executable. Avoid unrelated wording cleanup. Stop
and ask when the implementation and the docs disagree about the expected
behaviour.
