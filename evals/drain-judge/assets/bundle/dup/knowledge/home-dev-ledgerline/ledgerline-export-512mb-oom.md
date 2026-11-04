---
description: "ledgerline-export runs under a 512 MB MemoryMax, and attachment exports can exceed it."
---

`ledgerline-export.service` has `MemoryMax=512M`. With `--with-attachments` the export holds the attachments in memory, can go over that and be OOM-killed; the kill skips the shell's EXIT trap, so a stale `var/export.pid` blocks later runs. Watch RSS when buffering attachments, and ask ops to raise the limit if a real job needs more.
