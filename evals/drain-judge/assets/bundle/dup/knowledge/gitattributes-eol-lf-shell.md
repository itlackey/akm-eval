---
description: "Force LF for shell scripts in .gitattributes so Windows checkouts do not break them."
---

Git on the Windows build agent checked shell scripts out with CRLF, and running `./deploy.sh` in a Linux container failed with `/bin/bash^M: bad interpreter`. A line `*.sh text eol=lf` in `.gitattributes` makes every checkout use LF. The files in the repository were already LF.
