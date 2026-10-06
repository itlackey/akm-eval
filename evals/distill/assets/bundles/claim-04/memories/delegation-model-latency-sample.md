---
description: "On a 40-prompt set fast-8b answered in a median of 4.2 s and deep-27b in 6.8 s; quality was not compared."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-11
---
On the 40-prompt review set, the `fast-8b` model answered in a median of 4.2
seconds and the `deep-27b` model in 6.8 seconds, both through the delegation
tool on the shared GPU server with one request at a time. Answer quality was
not compared. A labelling job was using the same GPU during the run, so the
absolute times will differ on an idle server.
