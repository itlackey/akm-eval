# reports

Published results of the evals, and notes about the evals. Scores only, never private items.

- [`retired-evals.md`](retired-evals.md): what the retired evals asked, found and why they ended.
- [`review-2026-10-11.md`](review-2026-10-11.md): the review of this repository at commit `bacf627`.
- `<akm version>/`: results worth keeping, one folder per run. None are published yet. The layout is below.

A results folder in `evals/<name>/results/` is gitignored, so a result lives where the last run was made. A result that other people have to check, or that a later run has to be compared with, is copied here and committed.

## Layout

```
reports/
  <akm version>/              the version akm printed (akm_version in summary.json), such as 0.9.26
    <eval>/                   the folder name under evals/ or benchmarks/, such as nightly
      <label>/                the label of the run, without the date
        summary.json          as the eval wrote it
        samples.jsonl         one line per case, for the public corpus only
    matrix/
      <sweep>/                the prefix of a matrix sweep
        decision.json         from scripts/matrix/run
        decision.md
```

The version in the path is the one akm prints, and two builds of one version print the same. Put the build in the label (`pr1071-1`) and read `akm_build` in the summary to tell them apart. A run made with `--repeat N` is N folders, `<label>-r1` to `<label>-rN`, in the same `<eval>/` folder. The repeat summary is not copied: `scripts/compare/run --repeats` works out the spread again from the runs, and the summary lists the folders by the dated names they had when it was written.

### What goes in

| Corpus | `summary.json` | `samples.jsonl` |
|---|---|---|
| `public` | yes | yes |
| `private` (rewritten) | yes, after reading it (below) | **never**: its rows hold the rewritten items |
| `own`, `own-feedback` | yes, after reading it (below) | **never**: its rows hold your notes |

Nothing else of a results folder goes in: not `logs/`, not `improve.json`, not the `.running` marker, and nothing from `private/`, `.env` or `models.json`. For a matrix sweep, copy `decision.json` and `decision.md` and not `state.json` or `logs/`. Read `decision.json` first: it names the matrix file by its path on your machine, and the note of a row that has no result names a log file. Publish the runs the sweep compared under their evals too, so each row can be checked.

Read a `summary.json` before you commit it:

- A private run records `seed`. The seed makes the private set again from the public one, so a published seed gives the set to anyone and it can no longer be held back. Remove the `seed` key. (`assets_sha256` is a digest and stays.)
- `config` and `engine` name the model's endpoint: the host in `engine.endpoint`, the host and path in `model_endpoint`, and in `config` either `<MODEL_BASE_URL>` or the whole URL, depending on the eval. Replace what you do not want public with `<MODEL_BASE_URL>`.
- An own run reports counts and rates of your notes. Read the `by_class` and per-case parts for a name of your own.

## Compare with a published run

`scripts/compare/run` takes such a folder as a baseline, as it takes any results folder: it reads `summary.json` and `samples.jsonl`.

```
scripts/compare/run --treatment build reports/0.9.26/nightly/base evals/nightly/results/2026-10-12-pr1071-1
scripts/compare/run --repeats reports/0.9.26/nightly/base
```

So only a public-corpus folder, which has both files, can be compared case by case. A private or own folder has a summary only: `compare` refuses it, and the metrics can be read side by side by hand. `compare` refuses a different eval, corpus or collection. The model, the strategy and the config patch may differ: that difference is what is compared. A new run of another akm than the baseline's needs `--treatment build`, as in the first command above, and then the akm config, the model, the cases and the eval's code must still be the same. Both summaries must carry full identity: `assets_sha256`, `config`, `engine`, `harness_sha256` (a summary from before it needs a `git_commit` that is clean) and `status: complete`. When one of them does not, the comparison is exploratory: `compare` computes it and says what is missing, and it is a lead, not a conclusion.

## Index

| akm | eval | label | corpus | model | what it is |
|---|---|---|---|---|---|

Add a row for every folder you commit.
