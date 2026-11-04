# lesson-judge

Does the lesson judge pass useful new lessons and updates, and refuse status notes, restated rules and claims the source does not make?

`akm improve` has distill turn a memory into a lesson, or extend a lesson the library holds, and a judge scores the result before a person sees it. This eval gives that judge 178 lessons whose right answer is known, each one an input akm's distill sends it, through `akm judge distill.lesson`, so the prompt, scoring and pass rule are those of the akm under test. The model under test is the judge. The writer is not in the loop, so a change to the judge shows up alone, which distill's end-to-end numbers cannot do. Needs an akm with `akm judge` (0.10.261105 or later; not yet in a release, so akm main).

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package installation is needed. The examples below are commands to append after the image name in `docker run` (see the root setup).

```
evals/lesson-judge/run
evals/lesson-judge/run --model qwen3-27b
evals/lesson-judge/run --cases evals/lesson-judge/assets/held-out    # the held-out part
evals/lesson-judge/run --cases ~/notes/lesson-judge
```

`--limit N` keeps the good/bad proportion, with at least one of each from 2 cases on. `--strategy` and `--config-patch` change the akm config the eval writes. `--concurrency N` sets how many cases run at a time (default 2, all through one akm sandbox) and `--timeout-ms N` how many milliseconds akm gets for one (default 900000, 15 minutes). There is no `--corpus custom` rewrite: the cases are what akm's distill built on real runs, and a rewrite would change that. A custom corpus is `--cases DIR`. `--harness opencode` puts the judge on your opencode in place of the default connection, in a sandbox HOME with an opencode config of its own, as judge-gate does (see [judge-gate's README](../judge-gate/README.md)).

The model must return one JSON object when asked. A case is up to about 2k tokens. The eval sets temperature 0 and thinking off. The connection runner is the measured one: `--harness opencode` works and records `harness` in the summary, but no harness run of this eval is reported yet.

## What the judge is sent

Traced in akm `src/commands/improve/distill.ts` and `stage.ts` (origin/main cc4872fe8, `lessonQualityJudge`, schemaVersion 1). distill calls the judge with one `LessonJudgeInput`:

| Field | New lesson (`judgeAndQueue`) | Update (`proposeLessonUpdate`) |
|---|---|---|
| `lesson` | the writer's lesson as assembled, after distill's repairs and lint: frontmatter (`description`, `when_to_use`, `tags`) and body | the existing lesson's frontmatter with the writer's whole body, which is the existing body with lines added |
| `source` | the memory file, frontmatter included (the judge strips it) | the memory's body, frontmatter already stripped |
| `feedback` | the feedback lines the writer saw, `- [signal] reason`, left out when there are none | the same |
| `related` | the 3 nearest lessons, knowledge notes and skills, by one search per type on the first 500 characters of the lesson (keyword search in the harvest, as in the distill eval), each with its file's content; left out when the search finds nothing | never sent |
| `extending` | never sent | the existing lesson's body |

The judge's prompt cuts the source at 3000 characters, the lesson at 2000, the feedback at 1500, `extending` at 2000 and each related asset at **600**. `related` left out and `related: []` give the same prompt, which says to score non-redundancy 5, so a case keeps what akm sent. A new lesson with a defect in `lintLessonContent` or `collectLessonQualityFindings` never reaches the judge (it is queued for review unjudged), and an update that drops or rewords a line of the lesson, or adds none, is not judged either (`diffLessonBody`); `src/reachable.ts` applies those rules, and checks that each case's source, related assets and extended lesson are the files of the distill eval's library it was harvested from (the source by its body: akm stamps a memory's frontmatter before distill reads it).

The judge scores reusable, nonRedundancy and grounding from 1 to 5. A lesson passes when reusable and nonRedundancy are 4 or more (the mean of the first two is the score; grounding is not in it), a non-pass with a mean of 2.5 or more is `reviewNeeded`, and any criterion of 2 or less (grounding included) refuses it whatever the mean. What distill does with the verdict differs by mode, and the scorer follows each:

| | `pass` | `reviewNeeded` | neither |
|---|---|---|---|
| new lesson | queued for a person (`distill-review`) | queued for a person, deferred (`review_needed`) | refused, with a rejection window (`quality_rejected`) |
| update | queued for a person (`distill-update`) | the update ends (`update_rejected`) | the update ends (`update_rejected`) |

A new lesson refused with non-redundancy 2 or less makes distill try an update of the lesson it repeats, a second judge call that is a case of its own here; the new lesson is not queued either way. An update routes on `pass` alone, so review and reject are one route for it, and `routeOf` in `lib/judge.ts` is used only for new lessons. A judge that gave no verdict (`error`, `unparseable`) is what distill's `noVerdict` makes it, pass false with `reviewNeeded`: a review for a new lesson, a rejection for an update. Neither route accepts anything unattended: a pass only puts the lesson in front of a person, so a bad pass costs a reviewer's time and the chance that it is accepted.

## The cases

`assets/cases.jsonl`: 178 lessons, 40 good and 138 bad, labelled under rubric version 1 (`assets/README.md`), and `assets/held-out/cases.jsonl`: 53 more that a default run does not score. `assets/ADJUDICATION.md` records how the labels were set and the calls a maintainer might reverse. `assets/retired.jsonl` holds the inputs the harvest produced that cannot be labelled by the judge's prompt, or that akm no longer sends; the scorer does not read it.

| Mode | Label / kind | Cases | Real | Hand-written | With feedback |
|---|---|---:|---:|---:|---:|
| new | good | 25 | 22 | 3 | 3 |
| new | dated-status | 9 | 0 | 9 | 0 |
| new | duplicate-asset | 15 | 0 | 15 | 0 |
| new | one-run | 11 | 2 | 9 | 2 |
| new | ungrounded | 55 | 2 | 53 | 4 |
| update | good | 27 | 12 | 15 | 2 |
| update | off-rule-update | 17 | 0 | 17 | 1 |
| update | restated-update | 21 | 0 | 21 | 1 |
| update | ungrounded | 51 | 0 | 51 | 1 |

The table counts the default cases and the held-out ones together (231). Of them 38 are real inputs of akm's pipeline and the rest are hand-written writer replies run through it.

How the frozen context was built, and which cases are real, is in `assets/README.md` ("How the cases were made"). `bun evals/lesson-judge/src/reachable.ts --akm DIR` checks every case against akm's own distill rules (`AKM_CHECKOUT=DIR bun test evals/lesson-judge/src/reachable.test.ts` runs the same check as a test).

## How a case is scored

The case's input goes to `akm judge distill.lesson`, and akm's verdict becomes the route distill takes (above): `pass`, `review` (new lessons only) or `reject`; `error` is akm failing (no envelope, a crash, the time limit) and is left out of every count. The run stops, `aborted`, after 5 cases in a row with no result or no verdict.

| Metric | Meaning |
|---|---|
| `bad.new`, `bad.update` | bad lessons passed, by mode. The headline: each pass is a bad lesson put before a person |
| `by_origin` | good and bad passed, by mode, for the real cases and the hand-written ones apart |
| `bad_by_kind` | the same by `<mode>/<kind>`: `dated-status`, `one-run`, `duplicate-asset`, `ungrounded` (new lessons); `restated-update`, `off-rule-update`, `ungrounded` (updates) |
| `good.new`, `good.update` | good lessons passed, by mode |
| `good_rejected` | good lessons refused outright (new: a rejection window; update: the update ends) |
| `review_share` | the share of new lessons routed to review |
| `precision` | of everything passed, the share that was good, by mode |
| `criteria` | the mean of reusable, nonRedundancy and grounding on good and on bad cases, by mode: which criterion tells them apart |
| `routes` | pass, review and reject by `<mode>/<good or kind>` |
| `no_verdict` | the share of cases with no verdict, apart as `error` (the judge call failed) and `unparseable` (the reply held no verdict) |
| `akm_failed` | the share of cases akm gave no envelope for |
| `seconds` | mean, median and max seconds per call |
| `baselines` | what a judge that passes everything and one that refuses everything would score on the same cases |

Tokens per call are in `model_calls` (`prompt_tokens`, `completion_tokens`, means over the calls the provider counted, null when it counted none); akm reports no cost, so cost is unknown, not 0. With 25 or so cases in a group, one case is 4 points of its rate: read a gap of a case or two as noise. The criterion scores of every case are in `samples.jsonl`, so a pass rule can be tried offline on them: `scripts/pass-rule/run RESULTS_DIR...` (see its README).

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts`, `status` and `aborted_reason`, `rubric_version`, the model, akm version and build, `strategy`, `config_patch`, `concurrency`, `timeout_ms`, the akm `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `model_calls`, `assets_sha256`, `corpus_folder` and the `manifest`. `samples.jsonl` has one row per case: the label and kind, akm's verdict as printed (or its error), the route, the criterion scores, the reason and the seconds.

## Held-out part

`assets/held-out/cases.jsonl` holds 53 cases, every fourth case of each group (mode, label and kind) in id order; their ids are listed in `assets/README.md`. A default run does not score them: run them with `--cases evals/lesson-judge/assets/held-out` to confirm a decision (a prompt, a pass rule or a model choice) made on the rest. A test checks that the two files share no case.

## Baselines

A judge that passes everything has good 100% and bad 100%; one that refuses everything has both at 0%. The summary's `metrics.baselines` states them for the cases that ran.

## Known limits

- **Real output reached the good kinds, not the bad ones.** The writer (a 35B model at temperature 0) turned 39 of 70 memories into a judge input; it answered NONE on all six dated statuses and on most memories a lesson or skill covers. So the 179 bad cases are 175 hand-written against 4 real ones, and the 34 real good cases are the only evidence of what the pipeline sends for lessons that are fine. The bad hand-written lessons are the distill eval's own examples and replies written for this eval: they show whether the judge catches the kind, not how often a writer produces it. The summary reports good and bad passed for real and hand-written cases apart (`metrics.by_origin`): read the headline rates with them, since the hand-written cases carry the bad ones.
- **Hand-written replies are in the writer's format.** Each one has the writer's shape (`distill-lesson-system.md`): a one-sentence `description`, a `when_to_use` trigger (the real writer's for that memory where it wrote one) and a body of one to three sentences that does not repeat the description. A first version wrote the distill eval's example paragraph as both description and body, with a templated `when_to_use`, a shape the real writer never sends and a judge can tell apart; those 56 replies were rewritten and run through akm again (`assets/ADJUDICATION.md`, "Changes"). The bad replies are still shorter than the real lessons on average (about 400 characters against 540).
- **The harm groups are smaller than 40 or rest on one hand.** `dated-status` has 9 cases (there are six such memories), `one-run` 11, `duplicate-asset` 15, `off-rule-update` 21 and `restated-update` 22. A rate over 11 cases has a 95% upper bound of about 24% when none is passed.
- **`related` is empty for most new lessons.** Each library holds one case's assets, so only the cases that ship a lesson or a skill have a related list; the others carry no `related`, which the prompt reads as "score non-redundancy 5". The 15 `duplicate-asset` cases are a lesson copied word for word, the easiest duplicate. A lesson that restates a skill the prompt cuts at 600 characters could not be labelled (`retired.jsonl`).
- **One writer, one library style.** The memories are fictional and in English, and the real inputs are one 35B model's lessons; the judge model under test sees nothing of another writer's habits.
- **Feedback is rare.** The distill eval's cases carry none, so no real input has any; 14 hand-written cases have feedback lines recorded with `akm feedback`.
- **The 26 lesson-update memories `upd-15` to `upd-40` were not given to the real writer**, so their updates are hand-written; the real updates (12) are from `upd-01` to `upd-14` and `dup-04`.
- **`related` entries carry no `path`.** akm's pipeline passes each related asset with the `path` of its file, and `akm judge` refuses an input with an extra field, so the cases keep `ref` and `content`, which are all the judge reads.
- **Connection runner only.** `--harness opencode` runs the judge on an isolated opencode (`isolateHome`), and records `harness` in the summary, but no harness run of this eval is published yet.

## Licence

MPL-2.0.
