---
description: How often Vesper service tokens rotate and what breaks when one expires.
tags: [auth, tokens]
---

# Vesper token rotation

Vesper service tokens are rotated every 30 days at 02:00 UTC. The rotation job is a cron entry vesper-rotate in the platform repository. The old token remains valid for 48 hours after a rotation. Clients read the new token from the vault path secret/vesper/current. A client that presents an expired token still gets HTTP 401 with the code VSP-EXPIRED. Rotation failures page the platform on-call engineer. The rotation is skipped if a deploy is running and runs again an hour later.
