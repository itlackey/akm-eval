# Architecture notes

Phase 0/1 delivers a stable skeleton:

- `src/config`: loading, validation, absolute-path resolution
- `src/packs`: adapter contracts and optional-pack registry
- `src/memory`: backend contracts, retrieval metrics, answer metrics, judge helpers
- `src/reporting`: normalized results, compare, markdown/json/matrix output
- `src/core`: runtime context, artifacts, environment checks, process helpers
- `src/cli.ts`: smoke-ready commands for doctor/list/run/matrix/compare/report

External benchmark packs are intentionally stubbed behind adapters until real integrations are
plugged in.
