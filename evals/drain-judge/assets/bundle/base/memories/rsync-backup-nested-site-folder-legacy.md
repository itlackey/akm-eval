---
description: "Retired manual rsync backup approach for Brindle site"
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-18
---

Prior to 2026-03-15, the Brindle site backup relied on a manual rsync command without a trailing slash on the source directory. This approach was retired because it consistently resulted in the source folder being nested one level too deep within the backup destination, causing restore failures. The team replaced this with an automated Ansible playbook named `brindle-backup-v2`. This new approach explicitly ensures the trailing slash is present in the source path, guaranteeing that file contents are copied directly into the target directory rather than creating an extra nested folder. The legacy manual method is retained here for historical reference only to document the root cause of previous restore issues and the specific date the flawed process was decommissioned.
