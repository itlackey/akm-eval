---
description: "The deploy scripts failed with bad interpreter because Git on the Windows build agent checked them out with CRLF line endings."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-09
---
The packaging job checks the repository out on the Windows build agent and runs
the scripts in a Linux container. Git on that agent converts line endings to
CRLF on checkout, so `./deploy.sh` failed with `/bin/bash^M: bad interpreter`.
Adding `*.sh text eol=lf` to `.gitattributes` makes Git check shell scripts out
with LF on every machine, and the job passed. The scripts in the repository
were already LF; only the checkout changed them.
