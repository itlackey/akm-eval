# akm-bench

This folder contains the intentionally blocked `akm-bench` adapter.

- `adapter.ts`: hard-fails until `akm-bench` can be run through an authoritative external process boundary and normalized from its real result artifacts only

Current status:

- not runnable in this repo
- local proxy scoring has been removed
- both `opencode` and `openai-compatible` should be considered unsupported until the external artifact ingestion path exists

`akm-bench` should not be re-enabled unless it can preserve the same trust policy as the other packs.
