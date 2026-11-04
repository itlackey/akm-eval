---
description: "git push --follow-tags skips lightweight tags; create release tags with -a."
---

`git push --follow-tags` sends annotated tags only. A tag made with `git tag v2.4.0` is lightweight, so the commit went up, the tag stayed local, and the tag-triggered release job did not run for two hours. Use `git tag -a v2.4.0 -m "Release v2.4.0"` and push again; the release checklist now says so.
