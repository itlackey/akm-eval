---
description: "Status report on v2.4.0 release pipeline failure due to lightweight tag issue"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-27
---

As of November 12, 2026, the v2.4.0 release pipeline remains stalled. The initial commit `a1b2c3d` was pushed to origin, but the corresponding tag `v2.4.0` was not propagated because it was created as a lightweight tag. The CI/CD trigger, configured to listen for annotated tag pushes, did not fire. Consequently, the automated build and deployment jobs have not initiated. 

Current status: 
- Commit `a1b2c3d` is live on the remote repository.
- Tag `v2.4.0` exists only locally.
- Release job queue is empty for this version.

Pending actions: 
1. Delete the local lightweight tag.
2. Recreate it as an annotated tag: `git tag -a v2.4.0 -m "Release v2.4.0"`.
3. Push the tag to trigger the workflow.

This incident highlights a gap in our pre-release checklist. We are updating the documentation to mandate annotated tags for all future releases to prevent similar delays.
