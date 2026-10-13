# Public comparison ledger

The [benchmark ledger](https://itlackey.github.io/akm-eval/) builds from this
repository's committed `reports/` tree. Every completed public artifact has its
own row, including every repeat, pilot and compatibility diagnostic. Private,
running and aborted reports are excluded. The build makes no model calls.

The design adapts [fwdslsh/website](https://github.com/fwdslsh/website)'s palette,
typography, grid and slash motif, with CC BY 4.0 attribution.

## Use the table

All comparison columns are visible by default in a horizontally scrolling table.
Model and run stay fixed on desktop. Jump buttons move to quality, performance,
usage, settings and individual test metrics without hiding columns. The table
remains a table on mobile.

- Click any data-column heading to sort. Shift-click adds or changes another
  sort key. Numeric sorting uses numbers; unrecorded values stay last in either
  direction. The sort order is stated above the table.
- Filter with the model, test, collection, scope, version, method, strategy and
  date controls. Search covers every displayed field.
- Every column also has its own filter. Numeric columns accept minimum and
  maximum bounds in the displayed units. Text columns accept words or `|` for
  alternatives. Every column can show only recorded or unrecorded values.
- Select individual runs or select all filtered runs, then enable **Compare
  selected** to inspect their complete rows together. Clear selection restores
  the current filtered view.
- CSV and JSON exports contain exactly the filtered rows in the current sort
  order, with all columns and original report links.

Core columns cover run identity, model route, test, collection, dates, scope,
quality, case counts, errors, timeouts, timing distributions, model calls, token
usage, costs, engine settings, versions and source fingerprints. Every supported
test score also has a dedicated numeric column and its recorded denominator.
Column-heading tooltips describe units and measurement meaning.

## Data meanings

**Quality %** is the named primary metric scaled from 0–1 to 0–100. It is not an
overall score across tests. Paired task/answer benchmarks use the AKM arm; search
uses keyword nDCG@10. Both arms and both ranking methods also have their own
metric columns. Compare quality within the same test, collection and scoring
version. Unknown values remain unrecorded, not zero.

**Performance** comes from original summaries and samples. Case mean, p50 and
p95 use recorded elapsed command durations, including failed cases. Percentiles
use linear interpolation. Case-time sums measure work, not run wall time.
Wall time is shown only where the collector records it. Keyword, semantic,
control and AKM-arm timings stay separate. These durations include request or
agent overhead and do not claim to measure token decode speed or first-token
latency.

**Usage** uses recorded model-call and token fields. Available paired-arm token
records are summed with separate usage-coverage counts; failed calls may have no
usage record. Cached input tokens remain part of input-token totals. Costs are
never inferred from a provider's price or from free/local serving.

Raw configs, prompts, credentials, private endpoints and host paths are not
copied into the public dataset. Only explicitly projected scalar settings and
performance fields are added. Original public scores and case output are linked
from each row. The ledger does not rescore cases.

## Build and publish

From the repository root, with Bun 1.4.2:

```sh
bun run test:site
bun run build:site
```

Serve `.site-output/` with a static server. The page fetches adjacent data; opening
the HTML as a local file is not a working preview. Relative paths support GitHub
Pages' `/akm-eval/` project path and a local server root. Assets and data requests
include the source revision to keep deployments from mixing cached generations.

To build another published report tree:

```sh
scripts/ledger/run --results ../another-checkout/reports --output .site-output
```

The build records the results checkout's revision. An exported tree without Git
metadata uses `main`; pass `--source-revision COMMIT` to retain a pinned revision.
There are no fixed run counts, version folders or collection dates in the site.

`scripts/ledger/src/` joins the regular `scripts/check` typecheck and test lanes.
`.github/workflows/ledger-pages.yml` validates pull requests and publishes main
changes to `reports/`, the site or its builder through GitHub Pages.
To rebuild manually:

```sh
gh workflow run ledger-pages.yml --repo itlackey/akm-eval --ref main
```

All Actions are pinned. Only the deployment job receives Pages and OIDC write
permissions. The upload contains the public HTML, stylesheet, script, projected
JSON and `.nojekyll`.
