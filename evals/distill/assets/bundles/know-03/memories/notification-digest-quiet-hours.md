---
description: "Digest emails went out at 03:00 local time; the digest job now waits for the recipient's quiet hours to end."
source: "session:digest-quiet-hours"
observed_at: "2026-10-16"
confidence: 0.95
tags:
  - notifications
type: memory
---
Digest emails reached recipients in Lisbon at 03:00 local time because the job
ran on the server clock. The job now reads each recipient's quiet hours and
holds the digest until they end. After the change no recipient got a digest
between 22:00 and 07:00, and the send finished by 08:30.
