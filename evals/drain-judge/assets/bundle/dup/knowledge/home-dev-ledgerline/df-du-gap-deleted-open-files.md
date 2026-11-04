---
description: "When df reports far more used space than du, look for deleted files still held open."
---

A disk that `df` shows as full while `du` finds much less in use usually has deleted files still open by a process. List them with `sudo lsof +L1 /path/to/mount`. Restart the process, or truncate the file through `/proc/<pid>/fd/<fd>`, to free the space.
