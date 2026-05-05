# Project boundary

`akm-eval` is an orchestration layer. It owns configuration loading, pack/backend interfaces,
metrics, normalized result output, and CLI/reporting behavior.

## Hard boundaries

- Do **not** import benchmark implementation internals directly.
- Pack adapters may check whether optional external packages are installed, but the core project
  must stay runnable without them.
- Retrieval metrics and answer metrics stay separate in result structures and reporting.
- Result folders are self-contained and can be compared without rerunning evaluations.

## Forbidden dependencies

The boundary checker fails if code imports:

- `@akm/bench`
- `akm-bench/src/*`

This keeps the repo aligned with the adapter boundary described by the plan.
