# Public comparison ledger

The [benchmark ledger](https://itlackey.github.io/akm-eval/) builds from this
repository's committed `reports/` tree. Every public result has a row, including
repeats and pilots. Stopped/running snapshots are Diagnostic,
and legacy summaries carry an explicit completion-status note. Private corpora
remain excluded. The build makes no model calls.

The design adapts [fwdslsh/website](https://github.com/fwdslsh/website)'s palette,
typography, grid and slash motif, with CC BY 4.0 attribution. The grid uses pinned
Tabulator 6.5.0, bundled locally with its MIT license.

## Answer questions with the table

Choose a test and collection, then choose a view:

- **Quality ranking:** highest primary quality first, with the named metric,
  score-case count, errors, scope and additional test-specific scores. If only
  one answer model is published for that test, the page says so. Ranking runs
  cannot establish a model winner without comparable runs from other models.
- **Speed & usage:** fastest recorded median first, with p95, the timing basis,
  number of timed cases, calls, input/output tokens, costs and usage coverage.
  Compare the same test and timing basis. Command/query/agent elapsed times
  include overhead; new summaries expose model request duration and output tokens per second
  when recorded. Time to first token is not collected.
- **AKM impact:** scored with/without-AKM runs, ordered by paired quality gain.
  Both arm scores, gain in percentage points, its recorded confidence interval,
  paired cases, both medians and relative median-time change appear together.
  Positive gain means better quality; negative time change means faster.
  Pilot scope stays visible. Unscored diagnostics cannot produce an impact claim.

**Compare runs** provides the common quality and latency fields together.
**Run settings** exposes recorded model routes, engine settings, versions and
provenance. **All fields** exposes every field, including original timing
measures and individual test metrics. No row selection is needed.

- Use **Columns** to search, show or hide any field. Drag headings to reorder
  columns and column edges to resize them. Model and test stay fixed on wide
  screens. On touch screens up to 900px wide, runs appear as stacked cards
  with the selected fields, full run labels, a sort control and the same
  pagination. Scrolling the page reaches every field without sideways swiping.
- Click headings to sort; Shift-click combines sort keys. Numeric sorting uses
  numbers, with missing values last in either direction. The current sort is
  stated above the table.
- **Latest only** keeps the newest matching result per AKM version, test,
  model, collection, mode, search method, embedding model and strategy. Other
  filters, including column filters, apply first. Clear it to see older runs.
- **Full suite** includes only completed full collections with all selected
  cases scored and no recorded errors. **Cases scored / total** shows overall
  coverage; **Metric cases** is the subset used for the displayed quality score
  (for example, 19 eligible clusters out of a completed 47-cluster pool).
- Model, test, scope and multi-select AKM version filters are always available.
  **Filters** opens collection, eval versions, search methods, strategy and inclusive date bounds,
  plus conditions on any column. Conditions combine with AND. Filter chips
  can be removed individually; **Reset** clears all filters.
- Filters, selected columns and their order, and sorting are stored in the URL
  automatically. Click **Copy link** to copy the current view URL, or copy the
  address bar. Opening or reloading that link restores the same settings. For example, `?suite=skillret&role=Full+suite&akm=0.9.32&akm=0.10.261005-beta&latest=1`
  shows the latest full SkillRet results for those two versions. Search uses
  `q`, dates use `from` / `to`, and error-only uses `errors=1`. Advanced conditions
  use repeated `filter` parameters containing JSON `[column, operator, value]`
  arrays; column filters use `header.<column>=value`. Reset clears filter
  parameters while keeping the selected columns, preset view and unrelated URL
  parameters. Custom columns use repeated `column=key` parameters in display
  order; multiple sort keys use repeated `sort=key:asc` or `sort=key:desc`
  parameters in the table's sort order (last key takes priority). Preset
  defaults need no extra parameters.
  **Reset to comparison columns** removes the custom column selection.
- Enable **Column filters** to filter directly in headings. Numeric inputs
  accept `>=80`, `<=5`, `80..95` or an exact number in displayed units. Text
  inputs accept words and `|` alternatives. `blank` and `recorded` distinguish
  unavailable measurements from zero. Pasted values apply immediately.
- Hover headings for definitions and cells for full values. Short run labels
  link to the exact original summary; test names link to scoring documentation.
- CSV and JSON exports include all matching rows in sort order, all fields and
  original report links, regardless of pagination or column visibility.

## Data meanings

**Quality %** scales the named primary metric from 0–1 to 0–100. It is not an
aggregate score across tests. Paired task/answer benchmarks use the AKM arm;
search uses keyword nDCG@10. Original scores and denominators remain available
independently. Compare the same test, collection, mode, eval/scoring versions and
selected input set. Use the saved-run CLI to verify exact input compatibility.
Unknown measurements display —, distinct from recorded zeroes.

**Paired gain** comes from the recorded shared-case comparison. It need not
match the subtraction of overall arm scores: LongMemEval's full semantic run has
424/500 and 401/499 marginal accuracy; its paired gain uses 499 shared cases.
The recorded confidence bounds and pilot sample sizes are shown without
inventing stronger evidence.

**Latency p50/p95** select recorded command timings, keyword-query timings, or
with-AKM agent/answer timings, in that order. The separate **Latency basis**
column identifies the source; **Speed & usage** shows it by default. Original
arm and method distributions remain independent columns. Percentiles use
linear interpolation and include failed cases where timing exists. Case-time
sums measure work, not run wall time. Resumed runs leave full wall time unknown;
the final invocation alone cannot measure it. **Run wall time basis** distinguishes
new runner timing from older collector timing that may cover fewer phases.
Relative median-time change is
`(with-AKM median / without-AKM median - 1) * 100`; arm timing counts may differ.

**Usage** projects recorded model-call and token fields. Available paired-arm
records are summed with coverage counts; failed calls may have no usage record.
`model_calls.prompt_tokens` and `completion_tokens` are per-call means, shown
separately from totals. `model_calls.seconds` is mean request duration and includes
prefill, reasoning and overhead; output tokens per second is not decode-only
speed. These means are never multiplied by call counts to invent totals.
New LongMemEval artifacts include reader and judge calls, cached/reasoning tokens,
retries and provider-reported cost. Reused grades count once. **Usage basis**
identifies older artifacts whose totals cover readers only; **Calls with cost
records** shows monetary coverage. Arm-specific tokens remain reader-only.
Cached tokens remain part of input-token totals. Costs are never inferred from
provider prices or from free/local serving.

Raw configs, prompts, credentials, private endpoints and host paths are not
copied into the public dataset. Only explicitly projected settings and
performance fields are added. The ledger does not rescore cases.

## Build, verify and publish

From the repository root, with Bun 1.4.2:

```sh
cd scripts/ledger/src
bun install --frozen-lockfile --ignore-scripts
cd ../../..
bun run test:site
bun run build:site
```

For real browser verification (Node 20+ and Chromium):

```sh
cd scripts/ledger/src
bunx playwright install chromium
bunx playwright test --config playwright.config.mjs
```

The browser suite starts an isolated local static server, checks the actual
published dataset through UI interactions, and saves screenshots under
`.browser-results/`. It covers the three question workflows, numeric/missing
filters, sorting, resizing, column controls, pagination, exports and mobile
swipe scrolling, card sorting and phone/tablet layouts. Unit tests cover projection, rounding boundaries and unequal paired
sample sizes. GitHub Pages CI runs both suites before deployment.

Serve `.site-output/` with a static server. Relative paths support GitHub Pages'
`/akm-eval/` project path and a local server root. Assets and data requests
include the source revision to avoid mixing cached deployments. To build a
different published tree:

```sh
scripts/ledger/run --results ../another-checkout/reports --output .site-output
```

The build records the results checkout's revision. An exported tree without Git
metadata uses `main`; pass `--source-revision COMMIT` for a pinned revision.
There are no fixed run counts, version folders or collection dates in the site.

`.github/workflows/ledger-pages.yml` validates pull requests and publishes main
changes to the reports, site or builder. To rebuild manually:

```sh
gh workflow run ledger-pages.yml --repo itlackey/akm-eval --ref main
```

Actions are pinned. Only the deployment job receives Pages and OIDC write
permissions. The upload contains only the public page, local grid assets and
license, projected JSON and `.nojekyll`.
