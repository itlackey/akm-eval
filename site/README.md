# Public evaluation ledger

The [public ledger](https://itlackey.github.io/akm-eval/) builds from this
repository's committed `reports/` tree. It presents
completed public runs, with separate full-suite, pilot and diagnostic labels.
Private, running and aborted reports are excluded. This build runs no model calls.

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

An existing results checkout or exported report tree can be used instead:

```sh
scripts/ledger/run --results ../another-checkout/reports --output .site-output
```

The build records the results checkout's revision and links each row to its
original artifacts at that revision. An exported tree without Git metadata
uses `main`; pass `--source-revision COMMIT` to retain a specific source revision.
No fixed run counts, version folder, date, or private lab report is baked into
the site.

The builder and tests live under `scripts/ledger/src/`. Their pinned package
and TypeScript configuration join the normal `scripts/check` typecheck and test lanes.

## Publish and refresh

`.github/workflows/ledger-pages.yml` typechecks and tests the ledger, and builds
an artifact on pull requests. Deployment runs only from main, through the
`github-pages` environment. It follows [GitHub's custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Main changes to `reports/`, the site or its builder publish automatically.
Merge completed public results under `reports/` to refresh the ledger.
For an immediate manual rebuild:

```sh
gh workflow run ledger-pages.yml --repo itlackey/akm-eval --ref main
```

All Actions are pinned to commits. Build jobs have read access; only the main
deployment job receives Pages and OIDC write permissions. The uploaded directory
contains just the public page, styles, browser script, projected data and
`.nojekyll`. Collector configs, prompts, environment files and host paths are
not copied into it. Raw samples remain at their existing public artifact links.

## Scores and comparisons

The ledger shows the original recorded metrics without rescoring them. Unknown
counts stay unknown. Error counts and reduced denominators remain visible.
New suites retain their raw metric breakdown even before a compact score is added
to `scripts/ledger/src/data.ts`.

Latest full-run groups share model, AKM and measurement versions, harness and
input digests, configuration, settings and search mode. A changed fingerprint
starts another group; earlier rows remain available. Extract and consolidate
recovery artifacts can therefore form smaller groups than the total collected
repeat count. Do not pool different collectors to imply improvement.

Variation uses recorded correctness when present, otherwise a recorded pass
decision or outcome, and names that definition beside the result. Errored cases
and IDs absent from any repeat are excluded. Groups with one run or incomparable
verdicts have no flip estimate. Use the eval repository's current scorer and
compare command for controlled comparisons.
