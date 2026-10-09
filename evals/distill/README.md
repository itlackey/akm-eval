# distill

Do distilled lessons say only what the source memory says?

`akm improve` has distill turn a memory into a lesson: a short rule an agent should remember. akm queues the lesson for a person to review. A good lesson says what the memory says, in fewer words, and nothing more. A memory that is only a dated status, or repeats an asset the library already holds, or is covered by a lesson already, should get no lesson at all.

This eval gives distill 38 fictional memories and checks what it queues. A memory that deserves a lesson should get one that states its facts and claims no more than the memory does. Most of the others should get none. A memory that repeats a lesson the library holds and adds a fact should get an update to that lesson, and no new one. The checks are deterministic. There is no judge model.

The model under test is akm's engine: it writes the lesson, and it judges the lesson too. The prompts, the judge and the review rules are akm's own, so the eval follows the distill that your installed akm ships. It needs akm on `PATH`, or named in `AKM_BIN`, and a bun that has `Bun.YAML`. It records the akm version it used. It was built on akm 0.9.26. Compare results only between runs with the same akm version.

The `lesson-update` class needs an akm with distill's lesson update (akm #1090, in 0.10.0). An older akm cannot propose an update, so it scores 0 of 8 on that class and nothing else changes: the other 30 cases score as before.

## Run

```
evals/distill/run --corpus public
evals/distill/run --corpus private
evals/distill/run --corpus own
evals/distill/run --corpus own-feedback
evals/distill/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `own` and `own-feedback` read your own labelled memories from `private/distill/own/assets/` and `private/distill/own/assets-feedback/` (never published; results go to `private/distill/own/results/` and `results-feedback/`). They use the same cases format as the public corpus, so a lesson case needs `required` and `forbidden` lists too. A case in `own-feedback` may also carry `"feedback": [{"signal": "positive"|"negative", "reason": "..."}]`, recorded with `akm feedback` before distill runs, so the writer and the judge see it as in a real run. They send your memories to the model, so they run only when `MODEL_BASE_URL` is localhost, a private-network address or a name that resolves only to such addresses; the run stops with an error otherwise.
- `--limit N` runs N cases, taken from each class in turn, in file order, so a short run covers every class. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--strategy NAME` runs the akm strategy NAME in place of `distill-only`. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/distill/assets/`. Make it first with `./generate-assets --only distill`. The run stops with an error when it is missing.

A case takes 10 to 40 seconds on a 27B model, or 2 seconds when distill skips it, and a whole run about eight minutes. The cases run one at a time.

Each run writes two files to `evals/distill/results/<UTC date>-<label>/`, or to `private/distill/results/` for the private corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name and the names the endpoint reports, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit.
- `samples.jsonl`: one line per case, with its class, what distill did, the verdict, the lesson as queued, the facts it missed, the claims it made, its length ratio, the gate's decision, the judge's scores (`scores`), the number of model calls akm made (`calls`), the time and the names the endpoint reported. A lesson the judge rejected is queued nowhere, so the row has `lesson: null`; akm's result gives the eval its scores, its reason (in `detail`) and, from the akm build that records it, the lesson's text cut to 2000 characters (`rejected_lesson`, null on an older akm and on every row with a queued lesson).

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
- Requests use temperature 0 and ask the server to turn thinking off. A model that thinks is slow. If yours thinks anyway, turn it off in the server.
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
| `lesson-worthy` | 8 | a failure with a clear cause and a fix that worked | a lesson that states the facts the case lists and makes none of the claims it forbids |
| `over-claim` | 6 | a result with a limit: one place, one try, an untested guess | the same, and the lesson keeps the limit |
| `dated-status` | 6 | what was done or is pending on a date | no lesson |
| `restates-asset` | 5 | the rules of a skill the library already holds, which is in the case | no lesson |
| `duplicate-lesson` | 5 | a point that a lesson in the case already makes: 3 at the ref distill writes to, 2 under another name | no lesson, and no update either |
| `lesson-update` | 8 | the rule of a lesson in the case, under another name, and one or two facts it lacks: a cause, a number, a limit | one update to that lesson that keeps every line and adds only those facts, and no new lesson |

`private/distill/assets/` is the same cases with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. The memories and the library files are rewritten first and `cases.json` after, with one mapping, so a name changes the same way in a memory, in a file name and in what a correct lesson must state. `generate` then checks every case against its public one: each required fact and each forbidden claim is still in the memory, or still out of it; the two example lessons score as before; a lesson at the ref distill writes to is still there. It writes nothing if one check fails. The memories are already fictional, so the rewrite changes few names: the projects and the name of one drive. It also renames the tools, changes the numbers and versions, and moves every date. The facts and claims are mostly plain words, so `cases.json` changes little: a number in one changes the way it does in the memory. It is made by `generate` and never published.

## The checks

No judge model scores a case. akm has its own judge in distill, so it is part of what the eval measures, and not of how it scores. For a case that expects a lesson, the eval checks that:

- a lesson was proposed: the queue holds a lesson that distill wrote, in any state. A skip, a judge's rejection and a lesson that is not valid mean none;
- it states each required fact. A fact is a list of phrases, and any one of them states it;
- it makes no forbidden claim. A claim is a list of phrases too, and any one of them makes it, unless a denial or a doubt (`not`, `may`, `whether`, `unconfirmed` and the like) comes within six words before it or three after, as in "it is unconfirmed whether 0.125 inch is enough";
- it is not much longer than its memory: no more than 1.5 times the words.

Matching ignores case and punctuation. A word in a phrase matches the start of a word, so `retr` matches `retries`. A number matches only itself, and `*` stands for up to three words. The text scored is the lesson's description, `when_to_use` and body, without the keys akm adds, such as the memory's ref. For a case that expects none the check is that nothing was proposed. A skip counts as correct, and so does a judge's rejection. `samples.jsonl` records which. An update to an existing lesson is a proposal, so for a `duplicate-lesson` case it is wrong: the memory adds nothing, so the lesson should stay as it is.

An update proposal is told from a new lesson by its gate reason, `distill-update`. It is never counted as a lesson: its outcome in `samples.jsonl` is `update`, it is left out of `good_lessons` (a case that expects a new lesson and gets an update is `missed`), and a case that expects none and gets one is `wrong`.

For a `lesson-update` case, the lines the update adds are the lines of its body that are not in the existing lesson's body (compared by words, in any case and spacing, as akm compares them). The eval checks that:

- `update_proposed`: one `pending` proposal from distill sits on the existing lesson's ref, with the gate reason `distill-update`;
- `existing_kept`: every line of the existing body is still in the proposed body. akm checks this too, so a failure means a build that does not;
- `new_facts`: the added lines state each new fact the case lists (`required`, matched as above);
- `no_extra_claims`: the added lines make no forbidden claim (`forbidden`, matched as above, with the same denials and doubts). These are the claims a model adds beyond the memory and the lesson: a wider scope, a stronger word, a fix the memory never names;
- `no_new_lesson`: distill queued no lesson of its own beside the update.

A case is `right` when all five hold. It is `bad` when something was queued and a check failed, which includes a new lesson in place of the update, and `missed` when nothing was queued. The existing lessons have one sentence to a line, because akm keeps the lesson's lines as they are and a writer that rewraps them fails its own check.

## Read the results

| Metric | Meaning |
|---|---|
| `good_lessons` | `good` of `n` cases that expect a lesson, where the lesson passed every check. This is what distill should do. |
| `wrong_lessons` | `wrong` of `n` cases that expect none, where distill queued a lesson or an update anyway. This is what it should not do. |
| `lesson_updates` | `right` of `n` cases that expect an update to an existing lesson, where the update passed all five checks. `checks` counts the cases that passed each check. It is separate from the two above: those two are about the other 30 cases and mean what they meant before. |
| `by_class` | the same counts for each class: `good`, `wrong`, or `right` for `lesson-update` |
| `outcomes` | what distill did, for the cases that expect a lesson, those that expect none and those that expect an update: `lesson`, `update` (an update to an existing lesson), `skipped`, `rejected` (the judge scored it too low, nothing queued), `invalid` (the lesson was not valid, or akm could not queue it, so nothing is queued) and `error` |
| `bad_by` | why the lessons proposed for lesson cases were not good: a fact missed, a claim made, or too long. A lesson can fail in more than one way. |

In `samples.jsonl` the `verdict` is `good`, `bad` or `missed` (no lesson) for a case that expects one, `right`, `bad` or `missed` for a case that expects an update (its `checks` hold the five results, and `added` the lines the update added), and `right` or `wrong` for a case that expects none. A case where akm or the model failed, such as a timeout, an unreachable endpoint or an empty reply, is `error`, and is left out of the counts. The run stops when five cases in a row have errored, because the endpoint is down or rate limiting you, and the results of the cases that ran are kept.

For scale: a distill that queues a lesson for every memory has `wrong_lessons` at 16/16, whatever its lessons are worth. One that queues nothing has `good_lessons` at 0/14 and `wrong_lessons` at 0/16. A useful distill gets a good lesson for most of the lesson cases and queues none for the rest. A change is worth keeping when `good_lessons` goes up and `wrong_lessons` does not. `lesson_updates` is read on its own: with 8 cases, one case is 12.5 points, and an akm without #1090 scores 0.

The set is small. One case that expects a lesson is 7 points of `good_lessons`, and one that expects none is 6 points of `wrong_lessons`. A rerun can differ by a case or two even at temperature 0, because the server batches requests, so read changes of a case or two as noise.

The checks are a floor. A lesson can over-claim in a way no list foresees, and the lists catch the claims a model is likely to add. Read the lessons in `samples.jsonl` for the cases that failed, and for some that passed.

A model may have seen the public cases in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- A gateway may serve one model name from several providers. `served_models` in `summary.json` lists the names the responses gave, so you can see when a run was split.
- `samples.jsonl` keeps each lesson's text, so a result can be scored again when the checks change.
- The private cases keep their ids, so a private case pairs with its public one by id. `private/distill/map.json` lists what was renamed.
- The public cases hold no feedback. A memory with feedback reaches the writer's prompt as "what worked" and "what failed"; `own-feedback` cases can carry it.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
