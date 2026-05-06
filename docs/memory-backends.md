# Memory backends

The repository defines `none`, `raw-vector`, `akm`, `mem0`, `openviking`, and `zep` backend IDs.

Current runnable/truthful status:

- `none`: runnable
- `raw-vector`: runnable deterministic baseline backend
- `akm`: blocked for evaluated benchmark retrieval; fails explicitly with runtime detail and records that `akm --help` plus `akm info --format json` are verifiable while `akm memory --help` still does not document a truthful add/search contract
- `mem0`: blocked; currently an explicit unavailable external-backend stub
- `openviking`: blocked; currently an explicit unavailable external-backend stub
- `zep`: blocked; currently an explicit unavailable external-backend stub

The blocked external backends are kept as IDs for planned integration work, but they should not be treated as truthful benchmark comparison paths today.

Smoke/example configs that are meant to be runnable now avoid shipping `akm-memory` variants. Planned comparison configs can still include blocked backend IDs, but `akm-eval matrix` marks them as blocked and `akm-eval run` rejects them before benchmark execution.

`akm-eval doctor` now reports per-backend status, and `akm-eval run` fails before benchmark execution when a run selects one of the blocked external backend IDs.
