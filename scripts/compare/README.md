# Compare saved runs

```sh
scripts/compare/run A B
scripts/compare/run A B --json comparison.json --md comparison.md
```

A and B are completed results folders, or their `summary.json` files. One run on
each side is enough. The command reads stored data and prints quality,
performance, usage, settings and B-minus-A differences. Percent values use
percentage points for their deltas. Benchmark-native confidence intervals are
retained; the comparison does not calculate new intervals or declare a winner.
All scalar fields in `summary.metrics` remain visible alongside the ledger's
named metrics. Missing telemetry stays blank, distinct from zero.

## Valid comparisons

Both runs must have the same eval and scoring versions, corpus, collection,
mode, selected cases, input digests, labels and generated-corpus seed. A malformed,
unmanifested, running or aborted result is refused. Case order does not matter.
Cases are never silently intersected. Model routes, engine settings, AKM builds
and configuration may differ and are shown in the report. Multiple changed
settings cannot isolate any one setting's effect.

Quality deltas are omitted when scored case coverage or answer judges differ.
Performance and usage deltas are omitted when timing coverage, completion,
workers or task attempts differ. Metric denominator differences also suppress
that metric's delta. The original values and counts remain visible. Timing is
elapsed work or wall time as labelled; these are different measures.

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
