# Public AKM results

The [public results page](https://itlackey.github.io/akm-eval/) builds from this
repository's committed `reports/` tree. It includes completed public runs and
keeps small trials and compatibility checks separate from the default view.
Private, running and aborted reports are excluded. The build makes no model calls.

The design adapts the palette, typography, grid and slash motif from
[fwdslsh/website](https://github.com/fwdslsh/website) (CC BY 4.0). The stylesheet
records that attribution and the page links to the original theme.

## Build locally

From the repository root, with Bun 1.4.2 installed:

```sh
bun run test:site
bun run build:site
```

The output is `.site-output/`. Serve that directory with a local static server;
the page fetches its adjacent `data.json`, so opening the HTML as a local file
does not provide a working preview. Relative asset paths support GitHub Pages'
`/akm-eval/` project path and a local server root.

To use another published report tree:

```sh
scripts/ledger/run --results ../another-checkout/reports --output .site-output
```

The build records the results checkout's revision and links to original reports
at that revision. An exported tree without Git metadata uses `main`; pass
`--source-revision COMMIT` to retain a specific source revision.
No fixed run count, version folder or collection date is baked into the site.

The builder and tests live under `scripts/ledger/src/`. Their pinned package
and TypeScript configuration join the normal `scripts/check` lanes.

## Using the results

One table has three views:

- **Latest results:** the newest full test run for each model, collection and
  search method. Details show every repeat at the same AKM and scoring version,
  with earlier code or settings marked separately.
- **Every run:** every completed public run, including repeats and small trials.
- **Small trial runs:** partial tests and compatibility checks.

Test names describe the behavior being measured. Scores have specific labels,
values and denominators, with explanations and original scoring rules in Details.
For example, asset repair shows correct fixes and correct assets preserved;
consolidation shows safe retirements found and unsafe retirements. Search shows
both keyword and semantic scores where recorded, including judgment coverage.
Unknown values stay unknown. Original metrics and case output remain available
through the report links; the site does not rescore them.

The Runs count covers repeats with matching model, AKM and scoring versions,
harness and input digests, configuration, settings, engine settings and search
mode. Earlier runs remain visible individually in Details. Scores in the table
come from the newest run, not an average across different collectors.

Repeat consistency counts shared cases whose recorded correctness, pass decision
or outcome changed. Cases errored in any matching run are excluded. The display
names the verdict used; it does not claim all suites share one quality metric.
Use each eval's compare command for controlled comparisons with its current scorer.

Filters apply to the single displayed table. Search can find an earlier repeat
inside a latest-result group. The CSV export includes the selected groups' runs,
one row per numeric metric, with the numerator, denominator and report links.
The full projected snapshot is downloadable as JSON.

## Publish and refresh

`.github/workflows/ledger-pages.yml` typechecks and tests the ledger and builds
an artifact on pull requests. Main changes to `reports/`, the site or its builder
publish automatically through the `github-pages` environment.
For a manual rebuild:

```sh
gh workflow run ledger-pages.yml --repo itlackey/akm-eval --ref main
```

All Actions are pinned to commits. Only the main deployment job receives Pages
and OIDC write permissions. The upload contains the public page, stylesheet,
browser script, projected data and `.nojekyll`. Collector configs, prompts,
environment files and host paths are not copied into it.
