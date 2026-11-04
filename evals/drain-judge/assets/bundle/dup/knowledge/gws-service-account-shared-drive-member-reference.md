---
description: "Resolving 404 errors for service accounts accessing shared drive files by adjusting membership and API parameters."
---

When a reporting service account encountered `404 File not found` errors while attempting to access documents within the Ledger Archive shared drive, direct folder sharing proved ineffective. Although staff members could open these files without issue, the automated account failed. The resolution involved adding the service account as a Viewer member to the entire shared drive, which resolved the access issue almost immediately. Additionally, any subsequent Drive API requests must include the parameter `supportsAllDrives=true`. Omitting this flag results in continued 404 responses, even after the membership update. No modifications to the service account's authentication key or OAuth scopes were required to fix the problem.
