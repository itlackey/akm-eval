---
description: "The Brindle site was once backed up as a nightly tarball to a USB disk."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-18
---

The Brindle site used to be backed up by a cron job that wrote a `tar czf` of `/srv/site` to a USB disk on the host every night, keeping seven files. It was retired in 2026 for an rsync job to the backup volume.
