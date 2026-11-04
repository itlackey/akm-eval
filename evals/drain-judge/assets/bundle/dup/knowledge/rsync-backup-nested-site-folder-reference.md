---
description: "Correcting rsync path syntax to prevent nested directory duplication during site backups."
---

A recent synchronization task for the Brindle web application resulted in an incorrect directory structure because the source argument lacked a final forward slash. The command executed was `rsync -a /srv/site /backup/site`. Without the trailing slash, the tool treats the source as a directory name to be replicated, creating a nested path at `/backup/site/site`. This caused the restoration verification to fail, as the root of the backup appeared empty. By modifying the source path to `/srv/site/`, the utility correctly transfers the contents directly into the destination folder, aligning with the restore script's expectations. After verifying the new backup integrity, the erroneously created 4 GB folder was manually deleted to clean up the storage.
