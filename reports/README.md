# reports

Published results of the evals, and notes. Scores only, never private items.

- [`retired-evals.md`](retired-evals.md): what the retired evals asked, found and why they ended.
- `<akm version>/`: results worth keeping. None are published yet.

A results folder in `evals/<name>/results/` is gitignored. A result that others have to check, or that a later run will be compared with, is copied here and committed.

## Layout

```
reports/
  <akm version>/              akm_version of the summary, such as 0.9.26
    <eval>/                   the folder name under evals/ or benchmarks/
      <label>/                the run's label, without the date (a --repeat is <label>-r1 to -rN)
        summary.json
        samples.jsonl         public corpus only
    matrix/<prefix>/
      decision.json
      decision.md
```

Two builds of one version print the same version: put the build in the label and read `akm_build` in the summary.

## What goes in

| Corpus | `summary.json` | `samples.jsonl` |
|---|---|---|
| `public` | yes | yes |
| `custom` (a rewrite, or your own cases) | yes, without its `seed` | never: its rows hold the custom cases |

Nothing else: no `logs/`, no `.running`, nothing from `private/`, `.env` or `models.json`. For a matrix, copy `decision.json` and `decision.md`, and publish the runs it compared under their evals. Read `decision.json` first: it names the matrix file by its path on your machine.

Before you commit a summary, remove `seed` from a custom run (the seed makes the rewrite again) and read the per-case parts of a run of your own cases for anything private. Endpoints are recorded as a host, never a path.

## Compare with a published run

`scripts/compare/run` takes a published folder as it takes any results folder:

```
scripts/compare/run --treatment build reports/0.9.26/nightly/base evals/nightly/results/2026-10-12-pr1071-1
scripts/compare/run --repeats reports/0.9.26/nightly/base
```

Only a public folder, which has `samples.jsonl`, can be compared case by case. compare scores the baseline again with the current scorer, so a published run keeps its value after a scorer fix. A baseline of another eval version is compared only with `--treatment harness`; one made before akm-eval 0.2 is refused.

## Index

| akm | eval | label | corpus | model | what it is |
|---|---|---|---|---|---|

Add a row for every folder you commit.
