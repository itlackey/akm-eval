---
description: "The log shipper container grew to 6 GB over a weekend and the kernel killed Postgres; a memory limit on it stopped that."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-14
---
Over the weekend of 2026-09-12 the log shipper container on the reporting host
grew to 6 GB, because its buffer kept growing while the log store was down. The
host ran out of memory and the kernel's OOM killer stopped Postgres, the
largest process on the host with its shared buffers, and not the log shipper. A
512 MB memory limit on the log shipper means it is the one restarted when it
grows, and Postgres stays up.
