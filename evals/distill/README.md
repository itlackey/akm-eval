# distill

Do distilled lessons say only what the source memory says?

`akm improve` has distill turn a memory into a lesson: a short rule an agent should remember. akm queues the lesson for a person to review. A good lesson says what the memory says, in fewer words, and nothing more. A memory that is only a dated status, or repeats an asset the library already holds, or is covered by a lesson already, should get no lesson at all.

This eval gives distill 38 fictional memories and checks what it queues. A memory that deserves a lesson should get one that states its facts and claims no more than the memory does. Most of the others should get none. A memory that repeats a lesson the library holds and adds a fact should get an update to that lesson, and no new one. The checks are deterministic. There is no judge model.

The model under test is akm's engine: it writes the lesson, and it judges the lesson too. The prompts, the judge and the review rules are akm's own, so the eval follows the distill that your installed akm ships. It needs akm on `PATH`, or named in `AKM_BIN`, and a bun that has `Bun.YAML`. It records the akm version it used. It was built on akm 0.9.26. Compare results only between runs with the same akm version.

The `lesson-update` class needs an akm with distill's lesson update (akm #1090, in 0.10.0). An older akm cannot propose an update, so it scores 0 of 8 on that class and nothing else changes: the other 30 cases score as before.

## Run

```
evals/distill/run --corpus public
evals/distill/run --corpus custom
evals/distill/run --cases ~/notes/distill
evals/distill/run --corpus all
```

- `--corpus` picks the assets. `public` is the cases committed here. `custom` is a folder of assets with a `corpus.json` (see "Corpora" in the root README): by default the seeded rewrite in `private/distill/assets/`, and with `--cases DIR`, any folder of yours. `all` runs `public` and the default custom corpus and prints the two results side by side, never as one number.
- Your own labelled memories are a custom corpus of kind `own`: `--cases DIR`, with a `corpus.json` of `{ "kind": "own", "private": true }` beside the assets or in the folder. The folder is laid out like `evals/distill/assets/`, so a lesson case needs `required` and `forbidden` lists too, and may add `contradicts` (see "The checks"). A case may also carry `"feedback": [{"signal": "positive"|"negative", "reason": "..."}]`, recorded with `akm feedback` before distill runs, so the writer and the judge see it as in a real run. A corpus flagged private sends your memories only to a model whose line in `models.json` says `"private": true`; the run stops with an error naming the model otherwise. A folder with no `corpus.json` is private. Nothing is inferred from the URL: you say which models may see your memories, in `models.json` (see "The private flag" in the root README). Its results go to `private/distill/own/results/`, which is gitignored.
- `--corpus private`, `--corpus own` (`private/distill/own/assets/`) and `--corpus own-feedback` (`private/distill/own/assets-feedback/`, results in `private/distill/own/results-feedback/`) work for one more release as the custom corpora they are, and print one line naming the new form.
- `--limit N` runs N cases, taken from each class in turn, in file order, so a short run covers every class. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--strategy NAME` runs the akm strategy NAME in place of `distill-only`. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The default custom corpus is the rewrite in `private/distill/assets/`. Make it first with `./generate-assets --only distill`, which writes `corpus.json` beside it. The run stops with an error when it is missing, and when `private/distill/generated.json` is missing, was made from other public assets than the ones in this checkout, or was made by a generator that has changed since. `generate` writes it beside the assets, with three fields: the `seed`; the `inputs_sha256` of the public `cases.json` and bundles it read; and `rewrite`, one digest over the code that made the assets and checked them, which is `evals/distill/src/generate.ts`, `evals/distill/src/lib.ts` and `evals/distill/src/score.ts` (the checks `generate` runs on what the rewrite made), `lib/negation.ts` (the rule of negation those checks share with extract) and the code of `lib/rewrite` without its tests. Make the assets again after a change to the public cases or to any of that code, and once for assets made before `generated.json` held `rewrite`: `./generate-assets --only distill` with the same seed gives the same assets, unless `lib/rewrite`, the public cases.json or the bundles changed since.

A case takes 10 to 40 seconds on a 27B model, or 2 seconds when distill skips it, and a whole run about eight minutes. The cases run one at a time.

Each run writes two files to `evals/distill/results/<UTC date>-<label>/`, or to `private/distill/results/` (the rewrite) or `private/distill/own/results/` (your own memories) for a custom corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name and the names the endpoint reports, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit. It also says what the run was made of, and whether it finished:
  - `corpus`: `public` or `custom`; `corpus_kind` (`public`, `rewrite` or `own`), `corpus_private` and `corpus_folder`, for a custom corpus the folder from the repository root when it is inside the repository, else `null`, and `null` for the public corpus. `scripts/rescore` reads the cases of a custom run from `corpus_folder`, or from `--cases DIR` when it is `null` or the folder has moved. The summary never records an absolute path.
  - `config`: the akm config the eval wrote, strategy and `--config-patch` included, with every `apiKey`, `api_key`, `token` and `secret` replaced by `<redacted>` (a `$NAME` reference to an environment variable is kept) and the endpoint of the model written as `<MODEL_BASE_URL>`.
  - `engine`: the settings of the engine in that config: its name, `model`, the `endpoint` (scheme, host and port, no path and no credentials), `endpoint_id`, `temperature` (0), `enableThinking` (false) and `timeoutMs`.
  - `assets_sha256`: one digest over the corpus's `cases.json` and every file of its bundles, each named relative to the corpus folder, so two runs on the same assets have the same digest wherever the repository is. A change to a case or a memory changes it, and `--limit` does not.
  - `seed`: for a rewrite, the seed its assets were made with (from `corpus.json`, which is checked against `generated.json`); `null` for the public corpus and for your own memories, which no seed made, so two runs on the same notes compare whatever is in `private/seed`.
  - `manifest`: what the run was made of, for comparing it with another run (see "How results stay comparable" in the root README). It holds the collector and the scorer with their versions from `MEASUREMENT.lock` and the digests of their files, the input and the labels of every case the run selected, and which cases were scored and which errored.
  - `status`: `complete`, or `aborted` when the run stopped because five cases in a row errored. Then `n_run` may be less than the cases selected, and `aborted_reason` says why (otherwise `null`). The file is written before the run fails, so a folder that holds an aborted summary is not a whole run: do not compare it.
  - `timeouts`: how many of the errored cases ended because akm ran past its timeout (15 minutes for a case) and was killed. They are counted in `n_errored` too, and their rows have `timed_out: true`, so an akm that got slower shows as timeouts and not as unexplained errors.
- `samples.jsonl`: one line per case, with its class, what distill did, the verdict, the lesson as queued, the facts it missed, the claims it made (`forbidden`), the reversals it asserted (`contradicted`), its length ratio, the gate's decision, the judge's scores (`scores`), the number of model calls akm made (`calls`), the time and the names the endpoint reported. A lesson the judge rejected is queued nowhere, so the row has `lesson: null`; akm's result gives the eval its scores, its reason (in `detail`) and, from the akm build that records it, the lesson's text cut to 2000 characters (`rejected_lesson`, null on an older akm and on every row with a queued lesson). The row also keeps what it was scored from, so `scripts/rescore` can score it again with the checks of the day: `improve`, akm's result cut to the distill action and the models and calls of its usage report, and `proposals`, the lesson proposals in the queue with their state, gate and text. A case that ended in an error before akm answered has `error` and neither.

## Score a run again

The eval is split in two. `src/collect.ts` runs akm and records what it returned. `src/score.ts` (with `lib/negation.ts`) turns that into a verdict and the verdicts into metrics, and needs no akm. Both are declared in `src/measurement.ts`, and `MEASUREMENT.lock` holds a version and a digest for each. A fix to a check changes the scorer: `scripts/rescore/run <results folder>` scores a stored run again with the checks and the cases as they are now, into a new folder beside it, and `scripts/compare` does so by itself before it compares two runs scored differently. A run from before the manifest holds no `improve` and `proposals` in its rows and cannot be scored again: run it again. `evals/distill/golden/` holds raw outputs of distill with the rows the scorer must give for them (`src/golden.test.ts`); a change to the scorer that alters a row fails until the golden files are written again with `UPDATE_GOLDEN=1`, which the scorer's version bump asks for. `evals/nightly` scores its lessons with `checkLesson` from `score.ts`.

## How distill is run

For each case the eval makes a new akm bundle in a temporary folder, with its own config, and copies in the case's files: the memory, and the asset or lesson the case includes. It then runs akm's own command on that memory alone:

```
akm improve memories/<name> --strategy distill-only --no-sync --require-engines --json-to-stdout --format json
```

`distill-only` is a strategy in the sandbox's config. It turns off every improve process but distill, and sends distill to the one engine, the model under test. The eval then reads the proposal queue back with `akm proposal list --status <state> --detail full` for each state: pending, accepted, rejected and reverted. The queue decides whether a lesson was proposed.

What distill does in akm 0.9.26:

- It writes a lesson from the memory's body in one call: a file with a `description`, a `when_to_use` and a body. The lesson goes to `lessons/memory-<name>-lesson`.
- **`lesson_exists`**: when that file is already in the bundle, distill skips the memory before any model call, and queues nothing.
- It then asks the model to judge the lesson on novelty, non-redundancy and grounding, with the three lessons most like it in the bundle. A lesson that scores 4 or more on both of the first two is queued for review. A middling score, a judge that fails, or a lesson with a format fault is queued for review too. A low score queues nothing, and the memory waits 30 days.
- A queued lesson is a `pending` proposal with a gate decision `deferred`: reason `distill-review` when the judge passed it, `quality-review` when the judge was unsure. Both wait for a person. akm never accepts a distilled lesson by itself.

What distill does in akm 0.10.0 (#1090), besides the above: when the lesson it would write repeats a lesson the library already holds, it proposes an update to that lesson and not a new one. It tries this when the judge scores the new lesson 2 or below on non-redundancy, or when the writer answers that it has nothing to add and a lesson is among the nearest assets. A second call shows the writer the memory and the nearest lessons, and asks for the existing lesson's whole body with new lines added. akm drops the update if a line of the lesson is missing or reworded, if it adds no line, or if the judge, reading the added lines against the lesson and the memory, does not pass them. Otherwise the update is a `pending` proposal on the existing lesson's own ref, `source: distill`, with the gate decision `deferred` and the reason `distill-update`. It waits for a person like any other. A memory that adds nothing to the lesson gets no proposal.

Naming the memory bypasses akm's planner. The planner skips a memory that was flagged wrong, or that has only a positive with no reason, and picks memories by their feedback. None of that applies here: every memory is distilled.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the engine for both calls.

- It must follow an instruction to return one JSON object. akm asks for strict JSON with a schema, and goes on without one if the endpoint refuses it with a 4xx. An endpoint that answers a schema it cannot serve with a 5xx cannot be used, because akm does not retry: every case errors. One gateway route did this for the lesson schema that akm 0.9.26 sends. The eval keeps the schema on, because Qwen3.8 27B without it left out `when_to_use` in four cases of four, and akm refuses such a lesson.
- A case is two calls and about 2k tokens in all, so a context of 8k is safe. akm first sends one short call to check that the endpoint answers (`--require-engines`), and stops the case with an error that names the endpoint if it does not.
- The eval sets temperature 0 and `enableThinking: false` on the engine, and `summary.json` records both under `engine`. A model that thinks is slow. If yours thinks anyway, turn it off in the server.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect errors in `samples.jsonl`.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 8192 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

akm runs with keyword search only, so it needs no embedding model. distill's check for an existing lesson reads the bundle's files, so it does not depend on search. The judge's list of similar lessons does: it comes from keyword search.

## Assets

`assets/cases.json` holds 38 cases in six classes. Each has a memory in its own bundle in `assets/bundles/<id>/`. The fields, how a correct result is recorded and how the cases were written are in `assets/README.md`.

| Class | Cases | The memory | A correct result |
|---|---:|---|---|
| `lesson-worthy` | 8 | a failure with a clear cause and a fix that worked | a lesson that states the facts the case lists, makes none of the claims it forbids and does not turn the memory's advice round |
| `over-claim` | 6 | a result with a limit: one place, one try, an untested guess | the same, and the lesson keeps the limit |
| `dated-status` | 6 | what was done or is pending on a date | no lesson |
| `restates-asset` | 5 | the rules of a skill the library already holds, which is in the case | no lesson |
| `duplicate-lesson` | 5 | a point that a lesson in the case already makes: 3 at the ref distill writes to, 2 under another name | no lesson, and no update either |
| `lesson-update` | 8 | the rule of a lesson in the case, under another name, and one or two facts it lacks: a cause, a number, a limit | one update to that lesson that keeps every line and adds only those facts, and no new lesson |

`private/distill/assets/` is the same cases (the default custom corpus) with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. The memories and the library files are rewritten first and `cases.json` after, with one mapping, so a name changes the same way in a memory, in a file name and in what a correct lesson must state. `generate` then checks every case against its public one: each required fact is still stated in the memory, and each forbidden claim and each contradiction is still in it, or still out of it; the three example lessons (`good`, `bad` and `reversed`) score as before; a lesson at the ref distill writes to is still there. It writes into a temporary folder and moves the result into place only when every check passes, so a generation that fails leaves the earlier assets, map and `generated.json` as they were. The memories are already fictional, so the rewrite changes few names: the projects and the name of one drive. It also renames the tools, changes the numbers and versions, and moves every date. The facts and claims are mostly plain words, so `cases.json` changes little: a number in one changes the way it does in the memory. It is made by `generate` and never published. `private/distill/generated.json` holds the `seed`, the `inputs_sha256` of the public assets it was made from and the `rewrite` digest of the generator's code, and a run on the rewrite checks both digests (see "Run").

## The checks

No judge model scores a case. akm has its own judge in distill, so it is part of what the eval measures, and not of how it scores. For a case that expects a lesson, the eval checks that:

- a lesson was proposed: the queue holds a lesson that distill wrote, in any state. A skip, a judge's rejection and a lesson that is not valid mean none;
- it states each required fact. A fact is a list of phrases, and any one of them states it. A phrase that starts with `+` is an action the lesson must assert: it does not state the fact when a negation or a prohibition comes right before it (`not`, `never`, `avoid`, `without`, `stop`, `skip`, `instead of`, `rather than`), so "never wait for the visible heading" does not state `+wait * heading`, unless the negation is cancelled out by a negating verb under it (see below): "do not hesitate to wait for the visible heading" states it. Any other phrase is a thing to mention, and a negation next to it does not unstate it ("annotated tags, not lightweight tags" mentions lightweight tags);
- it makes no forbidden claim. A claim is a list of phrases too, and any one of them makes it, unless it is denied or doubted. A denial (`not`, `no`, `cannot` and the like) comes within six words before it or three after. A doubt (`may`, `might`, `could`, `if`, `whether`, `possibly`, `unconfirmed` and the like) has to govern the claim: it stands before the claim in the claim's own clause, within six words ("it is unconfirmed whether 0.125 inch is enough", "it may be that the fix works on all layouts"), or it is `unconfirmed`, `unverified`, `untested`, `unknown`, `unclear` or `unproven` and follows the claim ("the fix works on all layouts, which is unconfirmed"). A hedge word elsewhere in the sentence excuses nothing: "the fix works on all layouts, which could save a rebuild", "the fix works on all layouts if you build with Paged.js" and "you may rely on this: the fix works on all layouts" are claims. A clause ends at a comma, a colon, a bracket, a dash or "but";
- it contradicts nothing the memory shows. `contradicts` lists, for the essential action of the case, the phrases that turn it round: "wait for networkidle" for a memory whose fix was to stop waiting for it. It is read like `forbidden`, and a prohibition before a phrase in its clause denies it as well, so "never wait for networkidle" is not a contradiction, and "do not hesitate to wait for networkidle" is one. A lesson that mentions every fact, makes no forbidden claim and reverses the advice fails here. The row records what it asserted in `contradicted`;
- it is not much longer than its memory: no more than 1.5 times the words;
- it is not a copy of its memory: it repeats no more than three quarters of the memory's words word for word. The share (`copied` in the row) is the part of the memory's words that sit in a run of five or more words which the lesson has too, in the same order, case and punctuation aside. A lesson that states a fact in the memory's own words still passes: the example lessons of the public cases repeat at most 57 percent. The memory pasted back repeats all of it, with or without a description and a when_to_use around it, and so does a lesson with a few words of its own added. A copy that leaves out more than a quarter of the memory passes: the check is a floor.

A negation or a prohibition is bound to the action it governs, in `required` and in `contradicts` alike. It governs the verb right after it (with "ever", "to", "be", "try" and the like between), and a negating verb under it cancels it out: `hesitate`, `forget`, `fail`, `neglect`, `omit`, `refuse`, `decline`, `avoid`, `stop` and `cease`, `afraid`, `reluctant` and the like after `be`, and `wrong`, `bad` and `mistake`. A prohibition that is itself under a negation cancels out too ("do not avoid waiting for the heading", "do not skip waiting"). So "do not hesitate to wait for networkidle", "never fail to wait for networkidle", "there is no reason not to wait for networkidle" and "why not wait for networkidle" are contradictions, "do not hesitate to wait for the heading" states `+wait * heading`, and "never fail to avoid waiting for networkidle" denies it again. For a contradiction the negation has to stand in the phrase's own clause, within six words before it: "do not worry, wait for networkidle" asserts it. The rule is the one in `lib/negation.ts`, which extract reads its negations with too, so the two evals cannot drift apart; the test in `lib/negation.test.ts` checks that they agree.

Matching ignores case and punctuation. A word in a phrase matches the start of a word, so `retr` matches `retries`; the verbs `is`, `was`, `has`, `does` and the like match whole, so `is safe` does not find "isn't safe". A number matches only itself, and `*` stands for up to three words. A word written with a leading `=` matches that word only and not as a noun: `=wait for networkidle` finds "wait for networkidle" and "you should wait for networkidle", and not "timed out waiting for networkidle" or "the wait for networkidle". The text scored is the lesson's description, `when_to_use` and body, without the keys akm adds, such as the memory's ref. For a case that expects none the check is that nothing was proposed. A skip counts as correct, and so does a judge's rejection. `samples.jsonl` records which. An update to an existing lesson is a proposal, so for a `duplicate-lesson` case it is wrong: the memory adds nothing, so the lesson should stay as it is.

The matching is a lexical approximation, not a semantic guarantee. It reads words, not what they mean. A passing lesson is not proved to keep the right action, and a failing one is not proved to lose it. What it catches:

- a required action phrase (`+`) that is negated or prohibited right before it, in its clause;
- a listed reversal, in the words of the list: the opposite advice ("wait for networkidle"), the opposite result ("the vendor confirmed"), the limit dropped ("verified on both layouts");
- a forbidden claim, also when it is made twice and denied once;
- a fact named only in passing: the phrases of the public cases are specific ("wait for the heading", not "heading"), so a lesson that has the word in another sentence does not state the fact.

What it does not catch: a reversal in words the lists do not hold; a negation or a prohibition farther than the words next to the phrase ("waiting for the heading is a mistake"); a negation that governs a verb the rule does not list, which stands whatever the sentence means ("do not think it is wise to wait for networkidle" is not a contradiction); a sentence whose meaning turns on more than three words between the parts of a phrase; a doubt in an earlier clause that the claim depends on ("I suspect that, on the rulebook, the fix works on all layouts"), which no longer excuses it; irony and quotation; a correct lesson that quotes the wrong advice to reject it ("the earlier advice to never wait for the heading was wrong") does not state the fact it quotes. The public cases keep the phrases honest with three lessons each: `good` passes, `bad` fails on a forbidden claim, and `reversed` mentions the facts, makes no forbidden claim and still fails, and the tests also hold other correct wordings that must pass. Read the lessons in `samples.jsonl` for the cases that failed and for some that passed.

An update proposal is told from a new lesson by its gate reason, `distill-update`. It is never counted as a lesson: its outcome in `samples.jsonl` is `update`, it is left out of `good_lessons` (a case that expects a new lesson and gets an update is `missed`), and a case that expects none and gets one is `wrong`.

For a `lesson-update` case, the lines the update adds are the lines of its body that are not in the existing lesson's body (compared by words, in any case and spacing, as akm compares them). The eval checks that:

- `update_proposed`: one `pending` proposal from distill sits on the existing lesson's ref, with the gate reason `distill-update`;
- `existing_kept`: every line of the existing body is still in the proposed body. akm checks this too, so a failure means a build that does not;
- `new_facts`: the added lines state each new fact the case lists (`required`, matched as above);
- `no_extra_claims`: the added lines make no forbidden claim (`forbidden`, matched as above, with the same denials and doubts) and contradict nothing (`contradicts`). These are the claims a model adds beyond the memory and the lesson: a wider scope, a stronger word, a fix the memory never names, a new fact turned round;
- `not_copied`: the added lines are the new facts and not the memory pasted in: they repeat no more than three quarters of the memory's words word for word, as for a lesson (the share is `copied` in the row);
- `no_new_lesson`: distill queued no lesson of its own beside the update.

A case is `right` when all six hold. It is `bad` when something was queued and a check failed, which includes a new lesson in place of the update, and `missed` when nothing was queued. The existing lessons have one sentence to a line, because akm keeps the lesson's lines as they are and a writer that rewraps them fails its own check.


## Read the results

| Metric | Meaning |
|---|---|
| `good_lessons` | `good` of `n` cases that expect a lesson, where the lesson passed every check. This is what distill should do. |
| `wrong_lessons` | `wrong` of `n` cases that expect none, where distill queued a lesson or an update anyway. This is what it should not do. |
| `lesson_updates` | `right` of `n` cases that expect an update to an existing lesson, where the update passed all six checks. `checks` counts the cases that passed each check. It is separate from the two above: those two are about the other 30 cases and mean what they meant before. |
| `by_class` | the same counts for each class: `good`, `wrong`, or `right` for `lesson-update` |
| `outcomes` | what distill did, for the cases that expect a lesson, those that expect none and those that expect an update: `lesson`, `update` (an update to an existing lesson), `skipped`, `rejected` (the judge scored it too low, nothing queued), `invalid` (the lesson was not valid, or akm could not queue it, so nothing is queued) and `error` |
| `bad_by` | why the lessons proposed for lesson cases were not good: a fact missed (`missing_fact`), a claim made (`forbidden_claim`), a reversal asserted (`contradiction`), too long (`too_long`), or a copy of the memory (`copied`). A lesson can fail in more than one way. |

In `samples.jsonl` the `verdict` is `good`, `bad` or `missed` (no lesson) for a case that expects one, `right`, `bad` or `missed` for a case that expects an update (its `checks` hold the five results, and `added` the lines the update added), and `right` or `wrong` for a case that expects none. A case where akm or the model failed, such as a timeout, an unreachable endpoint or an empty reply, is `error`, and is left out of the counts. A case where akm ran past its timeout has `timed_out: true` on its row. The run stops when five cases in a row have errored, because the endpoint is down or rate limiting you, and the results of the cases that ran are kept, with `status: "aborted"` in `summary.json`.

For scale: a distill that queues a lesson for every memory has `wrong_lessons` at 16/16, whatever its lessons are worth. One that queues nothing has `good_lessons` at 0/14 and `wrong_lessons` at 0/16. One that queues the memory pasted back as its lesson, and for an update case the old lesson with the memory added, has `good_lessons` at 0/14 and `lesson_updates` at 0/8: a copy states every fact and makes no claim of its own, so only the copy check fails it. (Copying for every memory also puts `wrong_lessons` at 16/16.) A useful distill gets a good lesson for most of the lesson cases and queues none for the rest. A change is worth keeping when `good_lessons` goes up and `wrong_lessons` does not. `lesson_updates` is read on its own: with 8 cases, one case is 12.5 points, and an akm without #1090 scores 0.

The set is small. One case that expects a lesson is 7 points of `good_lessons`, and one that expects none is 6 points of `wrong_lessons`. A rerun can differ by a case or two even at temperature 0, because the server batches requests, so read changes of a case or two as noise.

The checks are a floor. A lesson can over-claim in a way no list foresees, and the lists catch the claims a model is likely to add. Read the lessons in `samples.jsonl` for the cases that failed, and for some that passed.

A model may have seen the public cases in training. A much better public score than a custom (rewrite) score points to that. Run the rewrite on a local model, or on an API that does not train on your data.

## Replay the pass bar

akm's judge scores a lesson on `reusable`, `nonRedundancy` and `grounding`, 1 to 5. A lesson passes when `reusable` and `nonRedundancy` are 4 or more: grounding is left out of the pass test and of the mean, and only a score of 2 or less on any criterion, grounding included, rejects. The reason recorded for leaving grounding out was that the judge was not shown the feedback, and it is shown it now.

`evals/distill/pass-bar [--rescore] RESULTS_DIR...` takes the results folders of distill runs on one corpus (`--repeat` makes one per run) and routes the judge's scores of each lesson under two bars: akm's (`shipped`) and one that puts grounding into the pass test and the mean (`with-grounding`). It counts the good and the bad lessons that pass, go to review and are rejected under each bar, and lists the lessons the bars treat differently. A lesson is good when it passes the checks above; a lesson for a case that expects none is bad. A lesson that passes or goes to review is queued for a person, so what the bar decides is which lessons are dropped. `mismatch` counts the lessons whose verdict under `shipped` is not the one akm gave, and should be 0. Rows without the scores or the text of the lesson (a skipped case, a lesson-update case, an akm that does not report a rejected lesson) are left out.

Whether a lesson is good is decided again from its stored text, by the cases, the memories and the checks of the code here now. A run keeps no copy of those, so `pass-bar` reads a run only when it read and ran the same ones. The `summary.json` of the run must hold the `assets_sha256` of its corpus folder as it is now (the digest the distill run computes, over `cases.json` and the bundles) and the `harness_sha256` of the code here, which holds the checks, and every case id in `samples.jsonl` must be in the corpus. Otherwise `pass-bar` exits 2 and says what differs, with both digests. A corpus regeneration that leaves the corpus folder as it was, or any other eval's change, does not stop it. Any change to the distill code or to `lib/` does: `harness_sha256` covers both, so a run made before the change needs `--rescore`.

`--rescore` is the explicit way to judge the stored lessons by the cases and the checks that are here now: for a run whose digests differ, a `summary.json` that has no `assets_sha256` or no `harness_sha256`, or a case that has since been dropped (its rows are left out). That is what to use after the checks change and you want the old lessons judged by the new ones. The output then names what it used. `inputs` has one entry for each folder: the `mode` (`stored` or `rescore`), the corpus folder read, the `stored` and `current` value of `assets_sha256` and of `harness_sha256` (`null` when the summary has none), the `differences` a read without `--rescore` would have stopped on, and the `missing_cases` left out. The scores and the verdicts akm gave are the run's own.

## Notes

- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- A gateway may serve one model name from several providers. `served_models` in `summary.json` lists the names the responses gave, so you can see when a run was split.
- `samples.jsonl` keeps each lesson's text and the raw output it was scored from, so a result can be scored again when the checks change, with `scripts/rescore` (see "Score a run again"), and its judged lessons replayed with `evals/distill/pass-bar --rescore`.
- The rewritten cases keep their ids, so a case of the rewrite pairs with its public one by id. `private/distill/map.json` lists what was renamed.
- The public cases hold no feedback. A memory with feedback reaches the writer's prompt as "what worked" and "what failed"; a case of your own corpus can carry it.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
