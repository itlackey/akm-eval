# compare

Sets two runs of an eval side by side, case by case, and says which cases flipped and whether the change is more than noise. It reads `summary.json` and `samples.jsonl` and runs nothing: no model, no akm.

The matrix calls a metric better only when its min-max range over three repeats lies wholly on one side of the baseline's, with a gap of at least 1.25 times the wider of the two ranges. That sees only large effects. Pairing the same cases is a much sharper test.

## Use

```
scripts/compare/run A B [--treatment AXES] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
scripts/compare/run --repeats PREFIX --against PREFIX [--treatment AXES] [--collection NAME] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
scripts/compare/run --repeats PREFIX [--collection NAME] [--json FILE] [--md FILE] [--tie X]
```

`A` and `B` are results folders (or their `summary.json`); B is read against A. `--repeats PREFIX` takes the runs of a `--repeat`: the folder path up to the label, such as `evals/nightly/results/2026-10-11-base`, which finds `-r1` to `-rN` (or give the `...-repeat-summary.json`). Alone it measures the noise floor; with `--against PREFIX` it compares two sets of repeats.

| flag | |
|---|---|
| `--treatment AXES` | what B changes: one or more of `build`, `config`, `model`, `inputs`, `harness` (default `config,model`) |
| `--collection NAME` | retrieval with `--repeats`: the collection, when the prefix matches more than one |
| `--json FILE`, `--md FILE` | write the report as JSON or markdown too (it is always printed) |
| `--seed N` | the bootstrap's seed (default 1) |
| `--resamples N` | bootstrap resamples (default 2000) |
| `--tie X` | for a score that is not a verdict (ndcg, a Harbor task's difference): a move of X or less is no change (default 0.01) |

Exit code 0 when it reports, 2 when it refuses or is misused.

## The comparison policy

`src/policy.ts`, which the matrix applies too. Runs differ along five axes:

| axis | what it is |
|---|---|
| `build` | the akm: `akm_version`, `akm_build`, `akm_build_fingerprint`, `akm_bin` |
| `config` | `strategy`, the config patch, the akm config the eval wrote, `timeout_ms` |
| `model` | the model, and each engine's model, endpoint host, temperature, `enableThinking` and `timeoutMs` |
| `inputs` | the input of each case (`input_sha256` in the manifest) and the seed of a rewrite |
| `harness` | the eval's version (`src/measurement.ts`) and the harness version |

Every axis not in the treatment must be the same in every run, on both sides and among the repeats of a side; otherwise the comparison is refused, naming the axis. `--repeats` alone has no treatment. The scope is never a treatment: the eval, corpus (`public` or `custom`), collection, mode (`consolidate --pool`, `longmemeval --retrieval-only`) and `embedder` must match.

Before comparing, every run is scored again with the current scorer and labels (`scripts/rescore`, in memory; the folders are not changed), so a scorer fix or a relabelled case needs no new run. A run that cannot be scored again (raw outputs missing, or a custom corpus outside the repository) is compared as it was scored, with a warning. A case whose input differs between runs is left out and named, unless `inputs` is the treatment. A run without a manifest (made before akm-eval 0.2) is refused.

The report is **exploratory** (shown, not a conclusion) when a run lacks evidence for an axis outside the treatment (such as its akm config), did not complete, or, for retrieval, `judged_10` fell from A to B (grade B's results first with `evals/retrieval/label --from`).

## What a case is

| eval | a case | right | harm | metrics with an interval |
|---|---|---|---|---|
| nightly | an item of the night | `ok` | `harm` | `items.rate`, `harm.items` |
| consolidate | a pair (a cluster with `--pool`) | the right retirement, or none | an unsafe retirement | `recall.value`, `precision.value`, `unsafe.n` |
| distill | a memory | verdict `good` or `right` | verdict `wrong` | `good_lessons.rate`, `lesson_updates.rate`, `wrong_lessons.rate` |
| reflect | a note | `correct` | a control broken, or a body touched | `defects.rate`, `controls.rate`, `proposals.touched_body` |
| promotion | a proposal | good accepted, bad not | bad accepted | `precision.value`, `recall.value`, `bad_accepted.value` |
| judge-gate | a candidate | good passes, bad does not | bad passes | `precision.value`, `good.rate`, `bad_harmful.rate`, `bad_churn.rate` |
| extract | a session | `correct` | routine saved, or planted instruction saved | `insights.rate`, `routine.rate`, `planted.saved_instruction` |
| bakeoff | a case of one process | the output has the shape and every check holds | none | `case_pass.rate`, `checks.rate` |
| longmemeval | a question | the judge marks the akm answer right; for `retrieval`, its ndcg | none | `accuracy.with_akm.rate`, `retrieval.hit_rate`, `retrieval.recall` |
| skillret | a query, per line | its NDCG@10 | none | `<line>.NDCG@10` |
| agent-ab, terminal-bench | a task | the akm arm's mean reward minus the control's | none per case | `delta.value` |
| retrieval | a query, per column | its ndcg@10 | none | `<column>.ndcg_10` |

An errored case has no verdict and is left out (nightly scores it as not right). The metrics are those of `EVALS` in `scripts/matrix/src/lib.ts`. Metrics that are not per case (nightly's `harm.outside_changed`, the Harbor evals' `akm.errored` and `engagement.control_calls`) are shown from the summaries, with no interval. A few more are shown marked `(not judged)`, such as retrieval's `ndcg_10_condensed` and `judged_10` and extract's `planted.ambiguous`.

## The report

For two runs, over the cases both gave a verdict:

- each side's cases scored out of those selected, and the ones scored on one side only (left out);
- agree, flipped to better, flipped to worse, with the ids and what each run did;
- harm that appeared or went away;
- an exact two-sided sign test on the cases that disagree;
- a paired bootstrap 95% interval on B minus A for each metric, resampling cases. A metric is better or worse when the interval lies wholly on one side of zero. About one interval in twenty crosses zero by chance;
- the same counts by class.

The interval is over the cases, not over the model's own variation, so measure the noise floor first.

`--repeats A --against B` pools each side's repeats: a case's outcome is its mean over the repeats (right in 2 of 3 is 2/3), a metric is the mean of the eval's metric over the repeats, and the bootstrap draws cases. The order of the repeats does not matter.

## The noise floor

`--repeats` alone takes N runs of one configuration and reports each case's flip rate (the share of pairs of runs in which its verdict differs) and their mean, the noise floor. `expected_flips`, the sum of the rates, is how many cases flip between two runs with nothing changed. A comparison of two single runs with about that many flips is no change. With repeats the count is higher: with 3 repeats a side, nothing changed still flips about 1.4 times `expected_flips` cases when each case goes either way, and about 2.3 times when each fails one run in ten. So read a comparison of sets by its sign test and interval.

It also gives each metric's mean, sd, range and `pairwise_spread`. `min_delta_hint` is the largest `pairwise_spread` among the main metrics, which is the mean difference between two runs and not the largest difference between two of them: a place to start the matrix's `--min-delta`. The runs must match on every axis.

## What it refuses

A different eval, corpus, collection, mode or embedder; a difference outside the treatment; a run without a manifest; an invalid manifest; the same folder twice, or no case in common; a folder with a `.running` file or without `summary.json` or `samples.jsonl`; an errored `consolidate --pool` run; an eval it has no per-case reading for.

## Code and tests

`src/lib.ts` holds the logic (`loadRun`, `comparePair`, `compareSets`, `compareRepeats`, `findRepeats` and the renderers) and `src/run.ts` the command. `src/policy.ts` is the policy, which imports only `lib/`, so the matrix can use it. `src/lib.test.ts` runs on the small results folders in `src/fixtures/`, written by `src/fixtures/make.ts`; `src/manifest.test.ts` builds reflect runs from `evals/reflect/fixtures`.

```
cd scripts/compare/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
