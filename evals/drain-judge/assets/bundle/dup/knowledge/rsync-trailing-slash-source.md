---
description: "Without a trailing slash on the source, rsync copies the folder itself, not its contents."
---

`rsync -a /srv/site /backup/site` put the Brindle files in `/backup/site/site`: a source with no trailing slash is copied as a folder into the destination. Write the source as `/srv/site/` to copy its contents, which is the layout the restore script expects.
