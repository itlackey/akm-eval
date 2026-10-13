---
description: "Running the Mossgate test suite with pytest -n 4 cut it from 18 to 7 minutes on the 8-core build machine; 2-core runners were not tried."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-27
---
The Mossgate API test suite took 18 minutes on the 8-core build machine. With
pytest-xdist and `-n 4` it took 7 minutes. Two tests that write to the same
temporary folder failed when they ran at the same time, so they were marked to
run in one worker. The shared runners that pull requests use have 2 cores, and
`-n 4` has not been tried there; the suite still runs serially on them.
