# Compare saved runs

```sh
scripts/compare/run A B
scripts/compare/run A B --json comparison.json --md comparison.md
```

A and B are saved results folders, or their `summary.json` files. One run on
each side is enough. The command reads stored data and prints quality,
performance, usage, settings and B-minus-A differences. Percent values use
percentage points for their deltas. Benchmark-native confidence intervals are
retained; the comparison does not calculate new intervals or declare a winner.
All scalar fields in `summary.metrics` remain visible alongside the ledger's
named metrics. Missing telemetry stays blank, distinct from zero.

## Valid comparisons

The command shows legacy, stopped, summary-only and mismatched results. Differences
in eval/scoring versions, corpus, collection, mode, cases, inputs or labels are
reported; they do not prevent viewing stored values. It never silently intersects
cases. A stale `.running` marker is a snapshot warning, not a reason to discard data.
Malformed JSON and duplicate sample IDs remain errors.

Matching manifests support deltas. Legacy public results can also use matching
recorded cases and a clean collector commit, with an explicit warning that original
input digests were not recorded. Unknown or conflicting identity suppresses deltas.
Rescored legacy results record scoring version/label digests separately; their
original input identity stays unverified. Model routes, engine settings, AKM builds
and configuration differences are shown. Multiple changed settings do not isolate
a single change.

Quality deltas are omitted when scored coverage, completion or answer judges differ.
Performance and usage deltas also require equal timing/workload coverage and cache
conditions. Different metric denominators suppress that metric's delta. Stored
values and counts remain visible; no winner is inferred.

Saved results do not expire when a checkout changes. Compare compatible old runs
as collected. To apply current scoring rules and labels, explicitly run:

```sh
scripts/rescore/run A B
scripts/compare/run A-rescored B-rescored
```

Use the actual generated folder names; repeats put `-rescored` before `-rN`.
Rescore verifies current case inputs, keeps the original collection identity,
records the current scoring version, and never modifies the source folders. A
custom corpus can be supplied with `--cases DIR`. Changed or missing inputs need
new collection, not rescoring.

## Optional repetition

Every eval retains `--repeat N`. Compare any two of its saved run folders, or
filter those runs in the ledger. There is no baseline role, minimum repeat count,
treatment-axis option, repeat-set analysis or automatic scheduling. Existing
`repeat-summary.json` files remain descriptive historical artifacts.

## Tests

From the repository root: `bun test scripts/compare/src`. Fixtures include the
original paired runs and recorded metric summaries from the former matrix.
Collector, scorer, privacy, compatibility and CLI tests remain in their relevant
suites; scheduler and automatic-verdict assertions have been replaced with tests
of the direct saved-run workflow.
