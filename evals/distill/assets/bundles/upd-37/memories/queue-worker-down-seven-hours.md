---
description: "The queue worker exited when Redis restarted and stayed down for seven hours overnight; its unit had no Restart setting."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-08-28
---
The queue worker exited with an error when the Redis server it reads from
restarted at 23:40 for an upgrade, and it stayed down until someone noticed at
06:50, seven hours later. Its systemd unit had no `Restart` setting. With
`Restart=on-failure` and `RestartSec=5` it now comes back within seconds, and a
test that stopped Redis for a minute showed the worker reconnect on its own.
