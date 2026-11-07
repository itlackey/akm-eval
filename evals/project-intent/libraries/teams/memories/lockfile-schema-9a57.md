---
description: The first line of a quaystone lock file
tags: [quaystone]
---
quaystone reads its lock file only when the file is named `quay.lock.toml` and its first line is `schema = 4`; any other first line is rejected.
