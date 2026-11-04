---
description: "The 2.4.0 release job never started because a lightweight tag is not pushed by git push --follow-tags."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-27
---
The 2.4.0 release workflow never started because the tag was not on the
remote. The tag had been created as a lightweight tag with `git tag v2.4.0`,
and `git push origin main --follow-tags` pushes annotated tags only, so the
commit went up and the tag stayed local. The release job triggers on tag
pushes, so nothing ran for two hours until someone noticed. Re-creating the
tag as an annotated tag with `git tag -a v2.4.0 -m "Release v2.4.0"` and
pushing again started the job. The release checklist now says to create tags
with `-a`.
