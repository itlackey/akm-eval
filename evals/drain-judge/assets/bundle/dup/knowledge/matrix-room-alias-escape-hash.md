---
description: "Escape the # of a Matrix room alias as %23 in an Apprise URL."
---

In an Apprise Matrix URL, a room alias written with a bare `#` (`matrixs://matrix.example.org/#ops-alerts:example.org`) sends nothing and reports no error: the `#` starts a URL fragment, which is dropped. Write it as `%23ops-alerts:example.org`. `notify.sh --dry-run` will not catch this, so check with a real message.
