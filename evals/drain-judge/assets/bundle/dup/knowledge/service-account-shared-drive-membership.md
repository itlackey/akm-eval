---
description: "A service account must be a member of a shared drive, and calls need supportsAllDrives=true."
---

To read files in a shared drive, a service account has to be a member of the drive (Viewer is enough); sharing a folder with its address still gives `404 File not found`. The Drive API request also needs `supportsAllDrives=true`, or it stays 404. The key and OAuth scopes need no change.
