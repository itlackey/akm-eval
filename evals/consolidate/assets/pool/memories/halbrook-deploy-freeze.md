---
description: When Halbrook deploys are frozen and who can lift the freeze.
tags: [deploy, freeze]
---

# Halbrook deploy freeze

Halbrook deploys are frozen every Friday from 15:00 UTC until Monday 06:00 UTC. The freeze is enforced by the gate job named hb-freeze-gate in the release pipeline. Only the on-call lead can lift the freeze, using the command `hbctl freeze lift --reason`. A lifted freeze lasts 4 hours and then comes back by itself. Hotfixes for a sev1 incident skip the freeze without a lift. Every lift is posted to the channel #halbrook-releases with its reason. The freeze calendar for public holidays lives in the file freeze-days.yaml.
