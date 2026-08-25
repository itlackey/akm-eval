# Project boundary

`akm-eval` is an orchestration layer for memory / long-term-recall benchmarks. It owns
configuration loading, pack/backend interfaces, metrics, normalized result output, and
CLI/reporting behavior.

Standard agentic-coding benchmarks (`swe-bench`, `terminal-bench`, akm's own task corpus) are out
of scope for this repo. They belong to the separate
[`akm-bench`](https://github.com/itlackey/akm-bench) repository, which runs them through Harbor.
This repo previously carried a local `akm-bench` pack folder (`src/packs/akm-bench/`) that only
ever returned an intentional "blocked" result; it has been removed rather than kept as dead
scaffolding — the "Forbidden dependencies" rule below is the actual, load-bearing boundary between
the two repos.

## Hard boundaries

- Do **not** import benchmark implementation internals directly.
- Pack adapters may check whether optional external packages are installed, but the core project
  must stay runnable without them.
- Retrieval metrics and answer metrics stay separate in result structures and reporting.
- Result folders are self-contained and can be compared without rerunning evaluations.
- `akm-eval` does not run coding benchmarks and does not depend on `akm-bench`'s runtime.

## Forbidden dependencies

The boundary checker fails if code imports:

- `@akm/bench`
- `akm-bench/src/*`

This keeps `akm-eval` from re-absorbing `akm-bench`'s container/agent/verifier machinery as a
dependency. The two repos are expected to converge on a shared normalized-result shape and
statistics module over time, but neither repo is a runtime dependency of the other.
