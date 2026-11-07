---
description: "How the nightly staging database refresh works."
team: data-platform
project: harbor-migration
tags:
  - staging
---
The nightly job dumps the production database and restores the dump into
staging. Staging is rebuilt from the dump every night.
