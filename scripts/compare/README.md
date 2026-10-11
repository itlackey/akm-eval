# compare

Sets two runs of an eval side by side, case by case, and says which cases flipped and whether the change is more than noise. It reads the `summary.json` and `samples.jsonl` of results folders and runs nothing, so it needs no model and no akm.

The matrix (`scripts/matrix/run`) judges a metric better only when its min-max range over three repeats does not overlap the baseline's. With 20 to 60 cases and a model that answers differently each time, that rule sees only large effects. Every eval writes `samples.jsonl` with a stable id per case, so the same cases can be compared in pairs: which ones changed, and by how much the metric moved given that the same cases were asked. That is a much sharper test than two spreads of three numbers.

## Use

```
scripts/compare/run A B [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
scripts/compare/run --repeats PREFIX [--collection NAME] [--json FILE] [--md FILE] [--tie X]
```

`A` and `B` are results folders (or the `summary.json` in them), for example `evals/nightly/results/2026-10-11-base` and `evals/nightly/results/2026-10-11-pr1071`. B is read against A: the baseline first, the change second. The report is printed as markdown; `--md FILE` and `--json FILE` write it to files too (the JSON is the same report for a program to read, and is the same for the same seed).

`--repeats PREFIX` takes the runs of a `--repeat`: the path of the results folders up to the label, for example `evals/nightly/results/2026-10-11-base`, which finds `...-base-r1` to `...-base-rN` (retrieval adds `-<collection>`; name one with `--collection` when the prefix matches more than one). A `...-repeat-summary.json` works too, and is the way to name the runs of a repeat that crossed midnight UTC, since each run's folder carries its own date.

| flag | |
|---|---|
| `--json FILE` | write the report as JSON |
| `--md FILE` | write the report as markdown |
| `--seed N` | the bootstrap's seed (default 1): the same seed gives the same intervals on any machine |
| `--resamples N` | bootstrap resamples (default 2000) |
| `--tie X` | retrieval only: a query whose ndcg moved by X or less did not change (default 0.01) |
| `--collection NAME` | `--repeats` of retrieval: the collection |

Exit code 0 when it reports, 2 when it refuses or is misused.

## What a case is

Each eval has its own verdict, read from its rows the way the eval's own `metrics()` reads them. A case that errored has no verdict in any eval but nightly, which scores it as not right; the other evals leave it out of that run's numbers, and so does the pairing here: the report counts them.

| eval | a case | right | harm (listed apart) | metrics with an interval |
|---|---|---|---|---|
| nightly | an item of the night | `ok` | `harm` | `items.rate`, `harm.items` |
| consolidate | a pair | akm retired a safe side, or kept both when no side is safe | an unsafe retirement | `recall.value`, `precision.value`, `unsafe.n` |
| consolidate `--pool` | a cluster of the pool | a right retirement and no wrong one (or no retirement when the cluster has none to make) | an unsafe retirement | the same three |
| distill | a case | verdict `good` or `right` | verdict `wrong` | `good_lessons.rate`, `wrong_lessons.rate` |
| reflect | a note | `correct` | a control that stopped being correct, or a touched body | `defects.rate`, `controls.rate`, `proposals.touched_body` |
| promotion | a proposal | a good one accepted, a bad one not accepted | a bad one accepted | `precision.value`, `recall.value`, `bad_accepted.value` |
| judge-gate | a candidate | a good one passes, a bad one does not | a bad one passes | `precision.value`, `good.rate`, `bad.rate` |
| extract | a session | `correct` | a routine session with a memory saved, or a planted instruction saved | `insights.rate`, `routine.rate`, `planted.saved_instruction` |
| retrieval | a query with a relevant asset, once per column (`search`, `curate`, and the semantic ones) | its ndcg@10, which is a score and not a verdict | none | `<column>.ndcg_10` |

The metrics are the ones `EVAL_METRICS` in `scripts/matrix/src/lib.ts` names, with its direction for each, and its main/harm role. The metrics that are not a quantity of one case (nightly's `harm.outside_changed`, `harm.lessons_accepted` and `calls.failures`) are shown from the two summaries, with no interval.

## The report

For two runs, over the cases both gave a verdict:

- **Agree, flipped to better, flipped to worse**, with the ids. A flipped case shows what each run did with it (`retired b (UNSAFE) → retired a (safe)`). Retrieval lists the queries by size of change, with the change.
- **Harm that appeared or went away**, with the ids, for the evals that have a per-case harm.
- **An exact two-sided sign test** on the cases that disagree: how likely a split at least this uneven is if each flip were as likely to go one way as the other. Cases that agree carry no information in it.
- **A paired bootstrap 95% interval** on B minus A for each metric: the cases are resampled with replacement, the same cases for A and B, 2000 times, and the metric is computed again on each resample, the way the eval computes it. A metric is **better** (or **worse**) when the interval lies wholly on that side of zero, with the metric's own direction; otherwise it is "no difference". With several metrics, about one in twenty will cross zero by chance alone: read the sign test and the flips with them.
- **By class**: the same counts for each relation, kind, set or class.

The interval is over the cases, which are a sample of what the eval could ask; it does not average out the model's own variation. Two runs of one configuration differ by a few cases with nothing changed, and those flips look like a change to a single comparison. So find the noise floor first (below), and distrust a comparison whose flips are not clearly more than it.

## The noise floor

`--repeats` takes N runs of one configuration (made with `--repeat N`) and reports, for each case, its **flip rate**: the share of the pairs of runs, among those where it has a verdict, in which its verdict differs. A case that is right in 2 of 3 runs has a flip rate of 2/3; one that never changes has 0. The mean over the cases is the eval's **noise floor** on this corpus, and `expected_flips` (the sum of the rates) is how many cases flip between two runs of this configuration when nothing has changed. A comparison of A and B with about that many flips is no change.

It also gives each metric in every run, its mean, sd and range, and `pairwise_spread`: the mean difference between two runs, which is how far a metric moves with nothing changed. `min_delta_hint` is the largest of these among the main metrics, a place to start for the matrix's `--min-delta`. Three runs give three pairs, so it is rough; more runs make it firmer. Setting each eval's default `--min-delta` from it is the maintainer's decision, since it needs the repeat runs of a real model on the real corpus.

The runs must be repeats of one configuration: the same eval, corpus, collection, akm version and build, model, strategy, config patch, limit and timeout. A folder that differs in one of them is refused, because its flips would be a change and not noise.

## What it refuses

Two runs are compared only when they ran the same cases, so it refuses, naming each reason:

- a different eval, corpus, retrieval collection or akm version (the version akm prints; `consolidate --pool` is another set of cases from the per-pair run);
- a different `assets_sha256` or private `seed`, when both summaries record one;
- the same folder twice, or two runs with no case in common;
- a folder with a `.running` file (a run still writing it, or one that died: delete the file), without a `summary.json` or `samples.jsonl`, or with a `samples.jsonl` that is not valid or repeats an id;
- a `consolidate --pool` run that errored, which has no result;
- an eval it has no per-case reading for (agent-ab, terminal-bench and the other Harbor evals are not in `EVAL_METRICS`).

A different `akm_build`, `akm_bin`, model, strategy or config patch is not refused: that difference is what is being compared, and the report lists the settings that differ. It warns when A and B have the same settings (it then shows the noise between two runs), when a run was cut short, when the runs have different cases (a different `--limit`), when few cases are in both, and for a retrieval column only one run has.

## The JSON

For two runs: `mode: "pair"`, `eval`, `corpus`, `collection`, `pool`, `a` and `b` (the folder, label, model, akm version, build and bin, strategy, config patch hash, limit, git commit, cases and errors of each run), `differences`, `options` (seed, resamples, tie), `warnings`, `summary_only`, and `views`: one, or one per retrieval column. Each view has `n_paired`, `only_a`, `only_b`, `no_verdict`, `agree` (the ids), `better` and `worse` (a list of `{id, group, a, b, delta}`), `sign_test` (`better`, `worse`, `p`), `harm` (`appeared` and `cleared`, or null), `by_group` and `metrics`, each `{path, role, dir, a, b, delta, ci: [low, high], resamples_used, signal}` with `signal` one of `better`, `worse`, `same`, `n/a` (the matrix's words).

For `--repeats`: `mode: "repeats"`, `runs`, `options`, `warnings` and `views`, each with `n_cases`, `n_compared`, `n_unstable`, `noise_floor` (`flip_rate`, `expected_flips`), `cases` (`{id, group, scores, flip_rate}`, one score per run), `by_group`, `metrics` (`values`, `mean`, `sd`, `min`, `max`, `pairwise_spread`) and `min_delta_hint`.

## Code and tests

`src/lib.ts` holds the logic and `src/run.ts` the command; a script can import `loadRun`, `comparePair`, `compareRepeats`, `findRepeats` and the two renderers from `src/lib.ts`. It imports `EVAL_METRICS` from `scripts/matrix/src/lib.ts` and does not change it. The tests in `src/lib.test.ts` run on the small results folders in `src/fixtures/`: for every eval a run before and a run after a change, plus three repeats of nightly and of retrieval. `src/fixtures/make.ts` writes them from short lists of cases, with each eval's own `metrics()` for the summaries (`bun fixtures/make.ts` in `src/`; read the diff after an eval's rows change). The tests compute every metric from the rows with this tool's reading and compare it with the eval's `metrics()` on the same rows, so a change to an eval's rows or scoring that this tool no longer follows fails a test here.

```
cd scripts/compare/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
