---
description: "The Brindle site backup landed one folder too deep because the rsync source had no trailing slash."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-18
---
The new backup job copied the Brindle site with `rsync -a /srv/site
/backup/site`. When the source has no trailing slash, rsync copies the folder
itself into the destination, so the files ended up in `/backup/site/site`, and
the restore test found an empty-looking top folder. With the source written as
`/srv/site/`, rsync copies the folder's contents, and the backup now matches
the layout the restore script expects. The 4 GB copy in the wrong place was
removed by hand.
