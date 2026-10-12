# compare

Sets two runs of an eval side by side, case by case, and says which cases flipped and whether the change is more than noise. It reads the `summary.json` and `samples.jsonl` of results folders and runs nothing, so it needs no model and no akm.

The matrix (`scripts/matrix/run`) judges a metric better only when its min-max range over at least three repeats lies wholly on one side of the baseline's, with a gap of at least 1.25 times the wider of the two ranges (`GAP_FACTOR` in `scripts/matrix/src/lib.ts`; see "Run a matrix" in the README). With 20 to 60 cases and a model that answers differently each time, that rule sees only large effects. Every eval writes `samples.jsonl` with a stable id per case, so the same cases can be compared in pairs: which ones changed, and by how much the metric moved given that the same cases were asked. That is a much sharper test than two spreads of three numbers.

## Use

```
scripts/compare/run A B [--treatment AXES] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
scripts/compare/run --repeats PREFIX --against PREFIX [--treatment AXES] [--collection NAME] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
scripts/compare/run --repeats PREFIX [--collection NAME] [--json FILE] [--md FILE] [--tie X]
```

`A` and `B` are results folders (or the `summary.json` in them), for example `evals/nightly/results/2026-10-11-base` and `evals/nightly/results/2026-10-11-pr1`. B is read against A: the baseline first, the change second. The report is printed as markdown; `--md FILE` and `--json FILE` write it to files too (the JSON is the same report for a program to read, and is the same for the same seed).

`--repeats PREFIX` takes the runs of a `--repeat`: the path of the results folders up to the label, for example `evals/nightly/results/2026-10-11-base`, which finds `...-base-r1` to `...-base-rN` (retrieval adds `-<collection>`; name one with `--collection` when the prefix matches more than one). A `...-repeat-summary.json` works too, and is the way to name the runs of a repeat that crossed midnight UTC, since each run's folder carries its own date. Alone it reports the noise floor of the runs, below. With `--against PREFIX` it compares the repeats of one configuration with the repeats of another, below.

| flag | |
|---|---|
| `--treatment AXES` | what B changes against A: one or more of `build`, `config`, `model`, `inputs` and `harness`, separated by commas (default `config,model`). See "The comparison policy" |
| `--against PREFIX` | with `--repeats`: the repeats of the configuration that is read against the first |
| `--json FILE` | write the report as JSON |
| `--md FILE` | write the report as markdown |
| `--seed N` | the bootstrap's seed (default 1): the same seed gives the same intervals on any machine |
| `--resamples N` | bootstrap resamples (default 2000) |
| `--tie X` | for a score that is not a verdict (retrieval's ndcg, skillret's, a Harbor task's difference): a case whose score moved by X or less did not change (default 0.01) |
| `--collection NAME` | `--repeats` of retrieval: the collection, of both sets with `--against` |

Exit code 0 when it reports, 2 when it refuses or is misused.

## The comparison policy

What two runs may differ in is `src/policy.ts`, which the matrix applies too. Runs differ along five axes:

| axis | what it is | recorded as |
|---|---|---|
| `build` | the akm | `akm_version`, `akm_build`, `akm_build_fingerprint` (the digest of a checkout's uncommitted changes and, for a Harbor run, of the dependencies its containers installed), `akm_bin` |
| `config` | the akm config the eval wrote | `strategy`, `config_patch` (its hash), a digest of `config`, `timeout_ms` |
| `model` | the model and its engine | `model`, and in `engine.engines` the model, the endpoint (its host and `endpoint_id`, a digest of its identity: never its path, which messages and reports never carry), temperature, `enableThinking` and `timeoutMs` of every engine the run used |
| `inputs` | the cases | `assets_sha256`, and the private `seed`. For runs with a manifest, the `input_sha256` of each case instead: see "Runs with a manifest" |
| `harness` | this repository's code | `harness_sha256` when every run has it, else a clean `git_commit`. For runs with a manifest, the collector's version and digest and the harness version: see "Runs with a manifest" |

A comparison declares its treatment, the axes it measures. **Every other axis must be the same in every run**, among the runs of a side as well as between the sides: for two sets of repeats each of the six runs is checked, not the first of each. A run that differs outside the treatment makes the comparison refused, with the axis and the runs named. Without `--treatment` the treatment is `config,model`, the settings of one build, which is what compare did before it had the flag: a different strategy, config patch or model is what is being compared, and a different akm build is not. To compare a release with the next, or a branch of akm with `main`, say `--treatment build`; the model, the akm config, the cases and the eval's code must then still be the same. Repeats of one configuration (`--repeats` alone) have no treatment: all five axes must be the same.

The scope is not an axis, and no treatment changes it: the eval, the corpus, the collection, the mode (`consolidate --pool` is another set of cases) and the `embedder` of `consolidate` and `nightly` (`--embedder real` and `deterministic` pair notes in different spaces). Runs that differ in it are refused, with the settings named (#69). The corpus is `public` or `custom`. The mode is `consolidate --pool`, and `longmemeval --retrieval-only` (no model and no answers: a full run is never compared with it). A summary from before the corpora were renamed (`corpus: "private"`, `"own"` or `"own-feedback"`) reads as the custom corpus, so an old run and a new one on the same cases compare. The digest of `config` leaves out the engine settings, which belong to the model axis. `git_commit` identifies the eval's code only when it is neither missing, `unknown` nor `-dirty`; `harness_sha256`, the digest of the eval's code and of `lib/`, uncommitted edits included, replaces it where every run records one.

**What the summaries do not say is a gap, not a pass.** A run that does not record `assets_sha256`, the akm `config`, the `engine` settings, a clean commit (or digest) of the code, or, for a private corpus, the seed, leaves that axis unchecked. If the axis is not in the treatment, the report is **exploratory**: the numbers are computed and shown, with a banner naming what is missing, and they are not a conclusion. The same goes for a run that does not say it finished: `status` is not `complete` (or is missing), results are missing from its `completion`, or, without a `--limit`, it ran fewer cases than the eval has. An aborted or partial comparison is exploratory, never refused. The matrix applies the same policy to its own results and gives a row in that position the verdict "exploratory", so it stays out of its conclusions.

## Runs with a manifest

A summary written by harness-v3 or later has a `manifest` (`lib/manifest.ts`; "How results stay comparable" in the root README). Every eval that declares a measurement writes one (`measuredEvals` in `lib/manifest.ts`). `compare` reads the build, the config, the engines, the settings and the hints from it, and does four things more with it:

- **The collector.** Its version and digest, with the harness version, are the harness axis. Two collector versions are refused unless `harness` is the treatment, because the raw outputs of an earlier collector are not comparable with a later one's. `assets_sha256` and `harness_sha256` are not compared for such runs: the cases are compared one by one, and the collector is the part of the code that matters. `scripts/matrix` applies the same policy to runs that all have a manifest, but cannot leave a case out of the numbers of a summary, so a case with another input there is a difference of inputs (see "Run a matrix" in the root README); any run without a manifest brings back the earlier comparison of `assets_sha256` and `harness_sha256`.
- **The scorer and the labels.** They are not an axis. When the runs have different scorers, or a case has different labels in them, or they were scored by a scorer or against labels other than the ones this checkout has now (a scorer fix, a case relabelled since), each run is scored again with the current scorer and the current labels (`scripts/rescore`; the folders are not changed), the report says which runs were, and its table shows `scored again from`. A run whose rows lack the raw output the scorer reads cannot be, and the comparison is refused with the fields named. The matrix does the same.
- **The inputs of each case.** A case is compared when its `input_sha256` is the same in every run of both sides. A case with another input is left out of every table, named in the report (`inputs_differ`), and a line says so. If more than a fifth of the cases the runs share differ (`MIN_SHARE`: 80% must match), the comparison is refused as a difference of inputs, unless `inputs` is the treatment, which compares every case and lists the number that differ under the treatment. This is what makes `reflect --retrieval-queries` part of a run's identity (#37): the searches it records are part of the input of the notes they are for.
- **Labels, scorer and cases after a change.** Nothing needs re-running for a scorer fix or a relabelled case: `scripts/compare/run A B` scores the runs again, and a case with another input is left out and named. After a collector change the runs from before it are refused unless `--treatment harness`. The root README ("After a change") has one example command for each.
- **Legacy runs.** A run without a manifest is compared as before, and the report is exploratory and names it, for an eval that declares a measurement (so can have a manifest). An eval that has none yet is compared by the earlier rules. A run that `scripts/rescore` made from a legacy one has collector version 0.0, known only by its `harness_sha256`: it compares with a later run only with `harness` as the treatment, and exploratory.

### Coverage: what each side scored

Each table says how many cases each side scored of the cases it selected, and names the ones that errored (#41):

```
Scored: A 8 of 10 cases, B 8 of 10 (errored: A `x`, `y`; B `p`, `q`). Every number below is over the 6 scored in both. Scored on one side only, and so left out: in A `p`, `q`; in B `x`, `y`.
```

The verdict is taken on the cases both sides scored, so a side that errored on two hard cases and scored two the other side errored on is compared on the rest, with the four named. Each metric shows its denominator, `6 of 10` in the `cases` column: the paired cases the metric is over, of the paired cases (a rate's pool is its class of cases, such as the defect cases). When fewer than 80% of the cases both sides selected could be compared, because runs errored, gave no verdict or were given another input, the report is exploratory and says how many were lost, and why. In the JSON, `coverage` of each view has `selected_a`, `scored_a`, `errored_a`, `scored_only_a` and the same for B, and `in_both`.

### Retrieval: the judged results

The qrels judge what akm 0.9.26's keyword search and BM25 returned, so a result nobody graded counts as not relevant in `ndcg_10`, and a ranker that surfaces ungraded assets reads as worse (#71). Beside the metrics the matrix judges, each retrieval table reports `ndcg_10_condensed` (over the graded results alone) and `judged_10` (the share of the first 10 that someone graded), marked `(not judged)`; in the JSON they are the `info` of the view. When `judged_10` falls from A to B by more than `--tie` (0.01), the comparison is exploratory, with the note that B surfaced results nobody graded and that `evals/retrieval/label --from <B's folder>` should grade them first.

## What a case is

Each eval has its own verdict, read from its rows the way the eval's own `metrics()` reads them. A case that errored has no verdict in any eval but nightly, which scores it as not right; the other evals leave it out of that run's numbers, and so does the pairing here: the report counts them.

| eval | a case | right | harm (listed apart) | metrics with an interval |
|---|---|---|---|---|
| nightly | an item of the night | `ok` | `harm` | `items.rate`, `harm.items` |
| consolidate | a pair | akm retired a safe side, or kept both when no side is safe | an unsafe retirement | `recall.value`, `precision.value`, `unsafe.n` |
| consolidate `--pool` | a cluster of the pool | a right retirement and no wrong one (or no retirement when the cluster has none to make) | an unsafe retirement | the same three |
| distill | a case | verdict `good` or `right` | verdict `wrong` | `good_lessons.rate`, `lesson_updates.rate`, `wrong_lessons.rate` |
| reflect | a note | `correct` | a control that stopped being correct, or a touched body | `defects.rate`, `controls.rate`, `proposals.touched_body` |
| promotion | a proposal | a good one accepted, a bad one not accepted | a bad one accepted | `precision.value`, `recall.value`, `bad_accepted.value` |
| judge-gate | a candidate | a good one passes, a bad one does not | a bad one passes | `precision.value`, `good.rate`, `bad_harmful.rate`, `bad_churn.rate` |
| extract | a session | `correct` | a routine session with a memory saved, or a planted instruction saved | `insights.rate`, `routine.rate`, `planted.saved_instruction` |
| bakeoff | a case of one of its five processes | the output has the shape and every check holds | none | `case_pass.rate`, `checks.rate` |
| longmemeval | a question, in the table `with_akm`; and in the table `retrieval`, a question with an answer in the history | the judge marks the answer given with akm's five sessions right; for `retrieval`, its ndcg, which is a score and not a verdict | none | `accuracy.with_akm.rate`; `retrieval.hit_rate`, `retrieval.recall` |
| skillret | a query, once per line (`search`, `semantic_search`) | its NDCG@10, which is a score | none | `<line>.NDCG@10` |
| agent-ab, terminal-bench | a task | the akm arm's mean reward minus the control's, over the trials that got a reward in each arm, which is a score; a task without a reward in an arm has no verdict | none per case (see below) | `delta.value` |
| retrieval | a query with a relevant asset, once per column (`search`, `curate`, and the semantic ones) | its ndcg@10, which is a score and not a verdict | none | `<column>.ndcg_10` |

The metrics are the ones `EVALS` in `scripts/matrix/src/lib.ts` names (`EVAL_METRICS` lists them), with its direction for each, and its main/harm role. The metrics that are not a quantity of one case (nightly's `harm.outside_changed`, `harm.lessons_accepted` and `calls.failures`, and the trials of the Harbor evals: `akm.errored`, akm trials that never got a reward, and `engagement.control_calls`, control trials that called akm, which count trials of tasks that may have no verdict) are shown from the summaries, with no interval; with sets of repeats, as their mean.

Beside them a table shows metrics the matrix does not judge, marked `(not judged)`, with no verdict of their own (`signal` is `n/a` in the JSON): retrieval's `ndcg_10_condensed` and `judged_10`, bakeoff's `valid_output.rate`, longmemeval's difference between its two arms and its `retrieval.mrr` and `retrieval.ndcg`, skillret's recall, completeness and MAP at 10, and extract's `planted.ambiguous`. That last one is a count of the planted sessions whose memory holds the planted phrase only behind a negation the scorer cannot read, and asserts none: it is not the instruction saved and not safe either, so it has no direction and the table says `(a count to look at, not judged)`. Read those memories (`ambiguous` in `samples.jsonl`). In the JSON its `dir` is `null`.

## The report

For two runs, over the cases both gave a verdict:

- **Agree, flipped to better, flipped to worse**, with the ids. A flipped case shows what each run did with it (`retired b (UNSAFE) → retired a (safe)`). Retrieval lists the queries by size of change, with the change.
- **Harm that appeared or went away**, with the ids, for the evals that have a per-case harm.
- **An exact two-sided sign test** on the cases that disagree: how likely a split at least this uneven is if each flip were as likely to go one way as the other. Cases that agree carry no information in it.
- **A paired bootstrap 95% interval** on B minus A for each metric: the cases are resampled with replacement, the same cases for A and B, 2000 times, and the metric is computed again on each resample, the way the eval computes it. A metric is **better** (or **worse**) when the interval lies wholly on that side of zero, with the metric's own direction; otherwise it is "no difference". With several metrics, about one in twenty will cross zero by chance alone: read the sign test and the flips with them.
- **By class**: the same counts for each relation, kind, set or class.

The interval is over the cases, which are a sample of what the eval could ask; it does not average out the model's own variation. Two runs of one configuration differ by a few cases with nothing changed, and those flips look like a change to a single comparison. So find the noise floor first (below), and distrust a comparison whose flips are not clearly more than it.

### Two sets of repeats

`--repeats A --against B` compares the repeats of two configurations, which is sharper than comparing one run with one run, since a model's own variation is averaged over the repeats. It pools them by case: a case's outcome on a side is its mean over the side's repeats (right in two of three is 2/3, and a retrieval query scores its mean ndcg), a metric is the mean of the eval's own metric over the repeats, and the bootstrap draws cases, the same cases for both sides, and recomputes that metric for every repeat. The cases that flipped are those whose mean went up or down. The result is the same whatever order the repeats are in: pairing the first repeat of A with the first of B would make the answer depend on which was which. The two sets may have a different number of repeats. A plain comparison of two runs is this with one repeat a side, and gives the numbers it always did.

## The noise floor

`--repeats` takes N runs of one configuration (made with `--repeat N`) and reports, for each case, its **flip rate**: the share of the pairs of runs, among those where it has a verdict, in which its verdict differs. A case that is right in 2 of 3 runs has a flip rate of 2/3; one that never changes has 0. The mean over the cases is the eval's **noise floor** on this corpus, and `expected_flips` (the sum of the rates) is how many cases flip between two runs of this configuration when nothing has changed. A comparison of two single runs with about that many flips is no change. With repeats the count is higher, since a case is scored by its mean over the repeats of a side and the means of two sides of one configuration differ more often than two single verdicts do: with 3 repeats a side, nothing changed still flips about 1.4 times `expected_flips` cases when each case goes either way (a case right in half its runs) and about 2.3 times when each fails one run in ten, the more the rarer the flip. So read the flips of a comparison of sets against its sign test and its interval, and not against `expected_flips`.

It also gives each metric in every run, its mean, sd and range, and `pairwise_spread`: the mean difference between two runs, which is how far a metric moves with nothing changed. `min_delta_hint` is the largest `pairwise_spread` among the main metrics, which is the mean difference between two runs and not the largest difference between two of them: a place to start for the matrix's `--min-delta`. Three runs give three pairs, so it is rough; more runs make it firmer. Setting each eval's default `--min-delta` from it is the maintainer's decision, since it needs the repeat runs of a real model on the real corpus.

The runs must be repeats of one configuration, the same in every axis of the policy: the eval, corpus, collection, akm version and build, strategy, config patch and config, model and engine settings, cases, limit, time limit and the code they ran. A run that differs in any of them from the others, not only from the first, is refused, because its flips would be a change and not noise.

## What it refuses

Two runs are compared only when they ran the same cases, so it refuses, naming each reason:

- a different eval, corpus, retrieval collection, mode (`consolidate --pool` is another set of cases from the per-pair run) or embedder;
- a difference on any axis that is not the treatment (above): another akm version, build or command unless the build is the treatment, another strategy, config patch or akm config unless the config is, another model or engine setting unless the model is, other cases (`assets_sha256` or private `seed`) unless the inputs are, other code unless the harness is (for runs with a manifest: another collector version, and the cases whose inputs differ when more than a fifth do), among the repeats of one side as well as between the sides;
- runs with a manifest that were scored differently and cannot be scored again, for want of the raw output in their rows;
- a manifest that is not sound (the validator names what is wrong);
- the same folder twice, or two runs with no case in common;
- a folder with a `.running` file (a run still writing it, or one that died: delete the file), without a `summary.json` or `samples.jsonl`, or with a `samples.jsonl` that is not valid or repeats an id;
- a `consolidate --pool` run that errored, which has no result;
- an eval it has no per-case reading for (one that is not in `EVAL_METRICS`).

It does not refuse, and it labels the report **exploratory**, a run that was cut short or is not complete, and a run whose summary lacks the evidence for an axis outside the treatment, a run without a manifest (for an eval that has a measurement), a run collected before harness-v3, fewer than 80% of the cases usable, and a retrieval `judged_10` that fell. It warns when A and B have the same settings (it then shows the noise between two runs), when the runs have different cases (a different `--limit`), when few cases are in both, and for a retrieval column only one run has.

## The JSON

For two runs, or two sets of repeats: `mode: "pair"`, `eval`, `corpus`, `collection`, `pool`, `a` and `b` (the first run of each side by folder name: the folder, label, model, akm version, build and bin, strategy, config patch hash, limit, git commit, the digests of the code and the cases, status, cases and errors, and for a run with a manifest its collector and scorer and the folder it was scored again from), `a_runs` and `b_runs` (the same for every run), `treatment` (the axes), `treated` (what differs on them), `differences`, `rescored` (the folders of the runs that were scored again), `inputs_differ` (the case ids left out because their input differs), `exploratory` (the reasons the report is no conclusion, empty when it may be used for one), `options` (seed, resamples, tie), `warnings`, `summary_only`, and `views`: one, or one per retrieval column. Each view has `coverage`, `n_paired`, `only_a`, `only_b`, `no_verdict`, `agree` (the ids), `better` and `worse` (a list of `{id, group, a, b, delta}`), `sign_test` (`better`, `worse`, `p`), `harm` (`appeared` and `cleared`, or null), `by_group` and `metrics`, each `{path, role, dir, n, a, b, delta, ci: [low, high], resamples_used, signal}` with `n` the paired cases the metric is over (null where it is not over cases) and `signal` one of `better`, `worse`, `same`, `n/a` (the matrix's words), and `info`, the same for the metrics the matrix does not judge (`role: "info"`, `signal` always `n/a`, and `dir` null for a count to look at).

For `--repeats` alone: `mode: "repeats"`, `runs`, `options`, `exploratory`, `warnings` and `views`, each with `n_cases`, `n_compared`, `n_unstable`, `noise_floor` (`flip_rate`, `expected_flips`), `cases` (`{id, group, scores, flip_rate}`, one score per run), `by_group`, `metrics` (`values`, `mean`, `sd`, `min`, `max`, `pairwise_spread`) and `min_delta_hint`.

## Code and tests

`src/lib.ts` holds the logic and `src/run.ts` the command; a script can import `loadRun`, `comparePair`, `compareSets`, `compareRepeats`, `findRepeats` and the two renderers from `src/lib.ts`. `src/policy.ts` is the policy (`checkMembers`, `identityOf`, `incompleteOf`), which imports only `lib/` (the manifest reader and the digests), so that `scripts/matrix/src/lib.ts` can use it; `checkMembers` reads the manifest only when it is given `{ manifest: true }`, which compare and the matrix do; the matrix adds `caseInputs: true`, which compares the `input_sha256` of the cases every run has. `src/lib.ts` loads `scripts/rescore/src/lib.ts` when a comparison needs a run scored again, and not before. `src/manifest.test.ts` tests the runs with a manifest: it builds reflect runs from the golden raw outputs of `evals/reflect/golden`. `src/golden-runs.ts` builds runs of any eval on the manifest from its golden folder, and `src/measured.test.ts` uses it: every eval that declares a measurement must be in `SUPPORTED` and in the matrix's `EVALS`, and agent-ab, terminal-bench, bakeoff, longmemeval and skillret are each compared, a run that does well against one that does badly, with the numbers checked against the eval's own summary of the same rows. `src/lib.ts` imports the registry `EVALS` and `EVAL_METRICS` from `scripts/matrix/src/lib.ts` and does not change them. The tests in `src/lib.test.ts` run on the small results folders in `src/fixtures/`: for every eval a run before and a run after a change, plus three repeats of nightly and of retrieval. `src/fixtures/make.ts` writes them from short lists of cases, with each eval's own `metrics()` for the summaries (`bun fixtures/make.ts` in `src/`; read the diff after an eval's rows change). The fixtures' summaries record the identity and the completion that the evals write, so a comparison of them is not exploratory; the two sides differ in the akm build, so the tests declare `--treatment build`. The tests compute every metric from the rows with this tool's reading and compare it with the eval's `metrics()` on the same rows, so a change to an eval's rows or scoring that this tool no longer follows fails a test here.

```
cd scripts/compare/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
