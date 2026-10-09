---
description: When Halbrook deploys are frozen and who can lift the freeze.
tags: [deploy, freeze]
---

# Halbrook deploy freeze

Halbrook deploys are frozen each Friday from 15:00 UTC until Monday 06:00 UTC. The freeze is enforced through the gate job named hb-freeze-gate in the release pipeline. The on-call lead alone can lift the freeze, using the command `hbctl freeze lift --reason`. A lifted freeze lasts 4 hours and then returns by itself. Every lift is announced in the channel #halbrook-releases with its reason. Hotfixes for a sev1 incident bypass the freeze without a lift. The freeze calendar for public holidays lives in the file freeze-days.yaml.
