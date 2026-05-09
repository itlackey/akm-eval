# Memory backends

The repository defines `none`, `raw-vector`, `akm`, `mem0`, `openviking`, and `zep` backend IDs.

Current runnable/truthful status:

- `none`: runnable
- `raw-vector`: runnable deterministic baseline backend
- `akm`: blocked until it exposes a documented add/search contract that maps truthfully to `MemoryBackend.add()` and `MemoryBackend.search()`
- `mem0`, `openviking`, `zep`: blocked external placeholders

Only `none` and `raw-vector` are runnable today. The blocked IDs remain for planned integrations, but `akm-eval matrix` and `akm-eval run` reject them before execution.
