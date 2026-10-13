---
tags: [security, secrets]
---

After a credential is pushed to a public repository, revoke it at the provider
first, then rotate it in every service that used it, and only then rewrite the
git history. Rewriting history alone never invalidates a leaked key.
