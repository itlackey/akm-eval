# Memory backends

The repository defines `none`, `raw-vector`, `akm`, `mem0`, `openviking`, and `zep` backend IDs.

Current runnable/truthful status:

- `none`: runnable
- `raw-vector`: runnable deterministic baseline backend
- `akm`: blocked for evaluated benchmark retrieval; fails explicitly with runtime detail
- `mem0`: blocked; currently an explicit unavailable external-backend stub
- `openviking`: blocked; currently an explicit unavailable external-backend stub
- `zep`: blocked; currently an explicit unavailable external-backend stub

The blocked external backends are kept as IDs for planned integration work, but they should not be treated as truthful benchmark comparison paths today.

`akm-eval doctor` now reports per-backend status, and `akm-eval run` fails before benchmark execution when a run selects one of the blocked external backend IDs.
