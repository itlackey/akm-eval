---
description: How often Vesper service tokens rotate and what breaks when one expires.
tags: [auth, tokens]
---

# Vesper token rotation

Vesper service tokens rotate every 30 days at 02:00 UTC. The rotation job is the cron entry vesper-rotate in the platform repository. The old token stays valid for 48 hours after a rotation. Clients fetch the new token from the vault path secret/vesper/current. A client that still presents an expired token gets HTTP 401 with the code VSP-EXPIRED. The rotation is skipped when a deploy is running and runs again an hour later. Rotation failures page the platform on-call.
