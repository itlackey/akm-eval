# Compare saved runs

```sh
scripts/compare/run A B
scripts/compare/run A B --json comparison.json --md comparison.md
```

A and B are saved results folders or their `summary.json` files. The command
shows recorded metrics, coverage, settings and numeric B-minus-A differences.
Missing values stay blank. Versions, models, configurations and cache settings
are shown so you can interpret the differences. There are no hash, manifest,
version or completion requirements and no automatic winner.

Legacy results, stopped runs and summary-only results are readable. The command
reports saved status and stale `.running` markers. It never collects new output,
rescales scores or changes source results. Malformed JSON and duplicate sample
IDs remain errors.

To apply the current scorer and labels to saved raw output explicitly:

```sh
scripts/rescore/run A B
scripts/compare/run A-rescored B-rescored
```

Rescore writes separate folders and leaves originals intact. Supply `--cases DIR`
for a custom corpus that moved or was outside the repository. It needs the cases
and raw fields the scorer actually uses, without requiring matching hashes.

Repeats remain optional. Run tests with `bun test scripts/compare/src`.
