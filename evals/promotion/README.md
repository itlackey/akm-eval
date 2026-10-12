# promotion

Of the promotions consolidate proposes, how many does the drain's judgment tier accept, and are those the good ones?

`akm improve` has consolidate propose turning a memory into a knowledge note, a promotion. A person is meant to review it. With triage on, `applyMode: promote` and judgment on, which is how the lab runs, the drain does it instead: a model reads each promotion and accepts, rejects or defers it, and an accepted one is written to the bundle with no one looking. From 2026-09-29 to 7 October, 89 promotions reached that tier in the lab. It accepted 71, rejected 8 and left 10 for a person. On 7 October a person went through the 54 promotions that were waiting, and accepted 3. So most promotions are not worth keeping: they repeat a note the bundle already has, describe something that is gone, or record a status that is out of date in days. This eval measures what the tier does with them.

It gives the tier labelled promotions, good and bad, and counts which it accepts. The bad ones are of three kinds: a duplicate of a note that is already in the bundle, a stale note that describes something retired or superseded, and an ephemeral one that is a status snapshot or pinned to a commit or a version. It reports the share of the good proposals accepted (recall), the share of the accepted proposals that are good (precision), and the share of the bad ones accepted, for each kind.

The model under test is the judge of the tier. The prompt, the tier and the queue are akm's own: the eval runs `akm proposal drain --judgment` on a queue it has filled, so it follows the tier that your installed akm ships. It records the akm version it used. It was built on akm 0.9.26, whose prompt shows the judge the proposal, the note it would overwrite (none, for a new note) and any other pending proposal for the same ref. It does not show the notes of the bundle that the proposal may repeat, so it cannot see a duplicate unless the proposal says so. A change that shows the judge the nearest notes is what this eval is for: run it before and after, with the same model.

## What a run does

Each run makes a temporary folder with its own akm config and bundle, and:

```
copies the library's knowledge notes into the bundle, without the note each proposal would write
writes each proposal's note as the memory its promotion names: memories/<name>
akm index --full                                          # with akm's embedding model, bge-small-en-v1.5
(writes each proposal into the pending queue, as a promotion of consolidate)
akm proposal drain --judgment --strategy promotion --yes
akm proposal list --status rejected --detail full        # the judge's reason for each rejection
```

- The bundle is indexed with embeddings, as in the retrieval eval. A judge that is shown the nearest knowledge notes of a promotion (akm after #1067) finds them from the stored vector of the promotion's source memory: it looks that memory up in the index, and takes the 5 knowledge notes nearest to it. A run needs that memory in the bundle, and the cases do not carry it, so the eval writes each proposal's note as the memory (`memories/<name>`, the `promotionSource` of the queued row). A real promotion is a rewrite of its memory, so this is close to it, and for a duplicate it puts the note it repeats among the nearest. The run stops if akm did not embed every asset.
- No command queues a proposal without a model, so the eval writes the rows into the `proposals` table of the sandbox's `state.db`, in the shape akm writes them, and checks that akm lists them all as pending. It checks first that the table has the columns it writes: see "Depends on akm's private schema".
- The config names one LLM engine, the model under test, and a strategy `promotion` whose triage block is the lab's: enabled, judgment on. It differs in one setting, `applyMode: queue`. A proposal the judge accepts is then staged, and not written. The tier decides the same either way, because the judge only judges: promote mode writes what it accepted afterwards, and promotion lint prints its findings and does not block (akm 0.9.26). Every proposal is judged against the same bundle, so the order does not matter, and no accepted note joins the neighbours of the next.
- A proposal is *accepted* when akm stages it, *rejected* when the judge rejects it, and *deferred* when the judge defers or gives no usable reply. A deferred proposal waits for a person, which is not an accept. A model call that fails is an error and is left out of the counts.
- akm 0.9.26 keeps the judge's reason only for a rejection; from 0.9.27-alpha.2 akm keeps it for accepts and defers too, and the eval records all three.

## Run

```
evals/promotion/run --corpus public
evals/promotion/run --corpus custom
evals/promotion/run --corpus all
evals/promotion/run --cases ~/notes/night-2026-10-07
evals/promotion/run --corpus public --repeat 4
```

- `--corpus` picks the proposals. `public` is `assets/cases.jsonl` on `corpus/library`. `custom` is a folder of your own set with a `corpus.json`, `private/promotion/own/` unless `--cases` names another: see "Run your own set" and "Corpora" in the root README. `all` runs `public` and the default custom corpus and prints the two results side by side, never as one number. `--corpus own` works for one more release, as `--corpus custom`, with a line that says so.
- `--cases DIR` runs the custom corpus in DIR instead of `private/promotion/own/`: DIR holds `cases.jsonl` and `library/`, in the format of "Run your own set". Use it for a set built for one question, such as the promotions of one night. Without a `corpus.json` in DIR it is your own notes and is private: it runs only against a model whose line in `models.json` says `"private": true`, and the refusal names `--cases`. Its results go to `private/promotion/results/` and report the corpus as `custom`. A relative DIR is from the repository root. It cannot be combined with `--corpus public`.
- `--limit N` runs N proposals, taking one of each category in turn: good, duplicate, stale, ephemeral. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. Each run plants its own sandbox. See "Repeat a run" in the root README.
- `--strategy NAME` runs the akm strategy NAME in place of `promotion`, in the drain. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

A private custom corpus sends your notes to the model, so it runs only against a model whose line in `models.json` says `"private": true`. It stops with an error naming the model otherwise, before anything runs. Nothing is inferred from the URL or the name of the model: you say which models may see your notes, in `models.json` (see "The private flag" in the root README).

Each run writes two files to `evals/promotion/results/<UTC date>-<label>/`, or to `private/promotion/results/` for a custom corpus:

- `summary.json`: the metrics, how many proposals ran and errored, the seconds the drain took, the model calls akm made (how many, how many failed, and the model names the endpoint reported; `null` when akm's events table cannot be read, with the reason on stderr), the model name, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit. It also says what the run was made of, and whether it finished:
  - `config`: the akm config the eval wrote, strategy and `--config-patch` included, with every `apiKey`, `api_key`, `token` and `secret` replaced by `<redacted>` (a `$NAME` reference to an environment variable is kept). The endpoint of the model is written as `<MODEL_BASE_URL>`; `engine` and `manifest` hold its host and a digest of its identity.
  - `engine`: the settings of the engine in that config: its name, `model`, the `endpoint` (its host and port only) and `endpoint_id` (a sha256 of the endpoint's identity), `temperature` (0), `enableThinking` (false) and `timeoutMs`.
  - `assets_sha256`: one digest over `cases.jsonl` and every file of the library's `knowledge/` folder, which is copied into the bundle, each named relative to its folder (`cases.jsonl`, `library/knowledge/...`), so two runs on the same proposals and notes have the same digest wherever the repository is. A change to a proposal or a note changes it, and `--limit` does not.
  - `corpus`, `corpus_kind`, `corpus_private` and `corpus_folder`: `public` or `custom`; for a custom corpus `own` (your notes) or `rewrite`; whether it is private; and, for a custom corpus, its folder from the repository root, or `null` when the folder is outside it (the path of a folder outside it can name what is in it, so it is not recorded) and for the public cases. `scripts/rescore` reads the cases of a custom run from `corpus_folder`, and takes `--cases DIR` for a run that has none.
  - `seed`: the seed of a `rewrite` corpus, and `null` otherwise. Your own notes were made by no seed, so a run on them records none: `private/seed` is not read. Two runs on the same notes compare whatever their `private/seed` files hold.
  - `status`: `complete`, or `aborted` when no proposal got a verdict (every row errored). Then `aborted_reason` says why (otherwise `null`). The file is written before the run fails, so a folder that holds an aborted summary has no numbers worth comparing.
  - `timeouts`: how many of the errored proposals failed because the model call timed out, judging by the text akm gives for the failed call (`timed out`, `timeout`). They are counted in `n_errored` too, and their rows have `timed_out: true`. An akm command that the eval itself kills for running past its timeout ends the run with a message that says so, and has no row.
- `samples.jsonl`: one line per proposal, with its label and category, the ref, what the tier did (`outcome`), the judge's reason (for a rejection, and from akm 0.9.27-alpha.2 for an accept or a defer too), and the error when a call failed. The outcome, the reason and the error are the raw output of the case, which the scorer reads: see "Rescore and the golden rows".

`summary.json` also holds a `manifest` (see "How results stay comparable" in the root README): the collector and scorer versions from `MEASUREMENT.lock`, and for each proposal a digest of its input and of its labels. A proposal's input is its ref and note and the notes of the bundle it was planted among, which are the library's without the notes of the proposals that run, so a `--limit` run and a full run do not share inputs.

## Rescore and the golden rows

The eval is split in two parts, as the root README describes. `src/collect.ts` is the collector: the akm config, the sandbox, the planted proposals, the drain, and how the drain's answer is read into an outcome, a reason and an error for each proposal. `src/score.ts` is the scorer: it gives the row (the outcome with the proposal's label and category, and `timed_out` for an error whose text says the call timed out) and the metrics. The scorer needs no akm.

`scripts/rescore/run <results folder>` scores a stored run again with the scorer and the cases as they are now, from the outcome, reason and error in its `samples.jsonl`, and writes the result beside it. A change to how an error is read as a timeout, or to a metric, scores every stored run again that way. A change to the collector is a new collector version, and runs from before it are not compared with runs after it.

`golden/` holds nine proposals of the public set, the raw output of the drain for each in the ways it can come (an accept, a reject and a defer with and without a reason, a failed call that timed out in each of the words akm and the endpoints use, a failed call that did not, a proposal the drain did not list) and the row the scorer must give. `bun test evals/promotion/src/golden.test.ts` fails when a scorer change alters one. After a deliberate change, bump the scorer (`scripts/measurement/run bump promotion scorer --reason "..."`) and write the rows again with `UPDATE_GOLDEN=1`.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the judge.

- It must follow an instruction to return one JSON object, `{"decision": "accept" | "reject" | "defer", "reason": ...}`. akm reads what lies between the first `{` and the last `}` of the reply. A reply it cannot read leaves the proposal deferred, and the eval cannot tell it from a defer.
- A call is the proposal plus about 300 tokens of prompt, so a note of 9 KB is about 3k tokens and 8k of context is safe.
- The eval sets temperature 0 and `enableThinking: false` on the engine, as distill does, and `summary.json` records both under `engine`. A model that thinks anyway is slow. If yours does, turn it off in the server. `--config-patch` can change either setting, and the summary then records the patched value.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect failed calls.
- One call a proposal, one at a time. On a 27B model on a local GPU a call took 8 to 12 seconds: 20 proposals took 3 to 4 minutes and 65 took 9 to 13.

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

## Depends on akm's private schema

The eval reaches into akm's `state.db`, which is not an interface akm promises to keep:

- **Writes** the `proposals` table, because no command queues a proposal without a model. It inserts one row per case with ten columns: `id`, `stash_dir`, `ref`, `status`, `source`, `created_at`, `updated_at`, `content`, `frontmatter_json`, `metadata_json`. Before it inserts, it reads `PRAGMA table_info(proposals)`. If the table is missing or lacks a column, the run stops with a message that names the missing columns and the ones the table has, and writes nothing. A table that gained a required column of its own, without a default, still fails in SQLite's own words.
- **Reads** the `events` table, to count the model calls of the drain (`calls` in `summary.json`). It reads `event_type` and `metadata_json`. If the table or a column is missing, `calls` is `null` and the reason is printed on stderr; the verdicts do not come from the events, so the run goes on.

So a new akm build can break this eval without a word in its changelog. The tests run the eval against a fake akm with the table as akm 0.9.26 lays it out, and cannot see a change in the real one: a run against a new build is the check. What would end the dependence is a command in akm that imports a proposal into the queue (`reports/review-2026-10-11.md`, A5); until akm has one, a run that stops with the schema message above is this dependence, and the fix is in the eval.

## Assets

- `assets/cases.jsonl`: 20 proposals made from the knowledge notes of `corpus/library`: 6 good, 6 duplicate, 4 stale and 4 ephemeral. The fields and how they were made are in `assets/README.md`. They carry a canary string: do not train on them.
- `private/promotion/own/`: your own set, if you have one. See below.

The proposals are in `cases.jsonl`, and the notes they may repeat are the library's: a run copies `corpus/library/knowledge` into the bundle and takes out each note that a proposal would write.

## Run your own set

The public proposals have the cue that decides each one in their text, so they are easy: a model that cannot tell them apart is not usable, and one that can has shown little. The set that tests a judge is a labelled set of real promotions. Put it in `private/promotion/own/` (or any folder, with `--cases`). Nothing in `private/` is published. The folder holds:

- `cases.jsonl`: one proposal a line, with the fields of `assets/README.md`: `id`, `label` (`good` or `bad`), `category` (`good`, `duplicate`, `stale` or `ephemeral`), `ref` (`knowledge/<name>`) and `content` (the note as proposed, frontmatter and body). Strip the `generated:` and `verified:` lines that akm stamps into a note it accepts, so that an accepted note does not give its label away. Extra fields are ignored.
- `library/`: a folder with a `knowledge/` folder in it. It is copied into the sandbox as the bundle, and the note of each case is taken out, so put in the notes a proposal may repeat, such as the nearest notes of each. Notes of other types are not read.
- `corpus.json` (optional): `{ "kind": "own", "private": true }`. Without it the folder is your own notes and is private. Write `"private": false` to say that the set holds nothing that must stay from other models. See "corpus.json" in the root README.

The run stops with an error that says this when the folder holds no set in this format. The lab's set, how it was labelled and how it was made are in `private/promotion/own/README.md`.

## Read the results

| Metric | Meaning |
|---|---|
| `proposals` | `n` that ran without an error, and how many are `good`: `share_good`. A judge that accepts everything has this precision. |
| `accepted` | `n` proposals the tier accepted, and how many of them were `good`. |
| `recall` | Of the good proposals, the share accepted: `accepted` of `of`. |
| `precision` | Of everything accepted, the share that was good: `good` of `of`. This is what the tier's acceptances are worth. |
| `bad_accepted` | Of the bad proposals, the share accepted. `by_category` gives it for `duplicate`, `stale` and `ephemeral`, each with its `n`. |
| `outcomes` | What the tier did with each label: `accept`, `reject`, `defer` and `error`. |

For scale: a tier that accepts everything has a recall of 100%, a precision equal to the share of good proposals and every bad one accepted. One that defers everything accepts nothing, which is safe and does no work. A useful tier accepts most of the good proposals and few of the bad ones, in every category.

The set is small. One good proposal is 25 points of recall in the own set and 17 in the public one, so read changes of a case or two as noise, and rerun before you trust a gap. A rerun can differ by a case or two, because the model judges again.

A model may have seen the public proposals in training. A much better public score than own score points to that, and to the cues that make the public ones easy.

## Baseline

Indexed with keywords only. akm 0.9.26, the model `chat/qwen3.8-27b` (27B, on the lab's GPUs, through its gateway, thinking off), 2026-10-07, commit `f53402d`. The two corpora are never pooled.

| | public (20) | own (65) |
|---|---:|---:|
| good proposals | 6 (30%) | 4 (6.2%) |
| accepted | 10: 4 good, 6 bad | 44: 4 good, 40 bad |
| recall | 4/6 (66.7%) | 4/4 (100%) |
| precision | 4/10 (40.0%) | 4/44 (9.1%) |
| bad accepted | 6/14 (42.9%) | 40/61 (65.6%) |
| duplicate accepted | 4/6 | 27/40 (67.5%) |
| stale accepted | 1/4 | 9/14 (64.3%) |
| ephemeral accepted | 1/4 | 4/7 (57.1%) |
| bad rejected, deferred | 7, 1 | 2, 19 |
| model calls failed | 0 of 20 | 0 of 65 |
| seconds | 238 | 527 |

- On the own set the tier accepted 44 of 65 proposals, and 40 of them are ones the owner rejected. 9 of every 10 acceptances were wrong. On the real queue it accepted 71 of 89 (80%, against 68% here), so the sandbox is close to what the lab saw. The judge rejected 2 of the 61 bad proposals and deferred 19: it almost never says no.
- It accepted the duplicates as often as the others, 67.5% against 65.6% for all bad ones. That is what the prompt allows: it does not show the notes of the bundle, so a duplicate looks like any new note. The 2 bad proposals it rejected on the own set were rejected for the commit hashes and test counts in their text, not for repeating a note.
- On the public set, whose bad proposals say in their text that they are superseded or a status snapshot, it rejected 7 of 14 and accepted 6. It accepted 2 of the 4 that say they are deprecated, in the first run, and 1 in the second.
- It accepted every good proposal in the own set, and 4 of 6 in the public one. With 4 good proposals, the recall of 100% says little. Of the public proposals it rejected, a good one was rejected as cut off: `good-05` ends in an empty ```markdown block, as the library note it was made from does. That one is cut off. akm also wraps the proposal in a ``` fence, so a note that holds a closed code block can look cut off to the judge, and a real promotion was rejected for that on 2 October. Whether this set shows it is not clear.
- A rerun differs. The same run before the code was committed (akm 0.9.26, the same model) accepted 40 of the 65, with 36 of the 61 bad: stale 6/14 against 9/14 now. On the public set it accepted the same 10, with stale 2/4 and ephemeral 0/4. Read differences of 4 proposals or fewer as noise.

## With the nearest notes shown to the judge

akm 0.9.26 does not show the judge the notes of the bundle. [akm#1067](https://github.com/itlackey/akm/pull/1067) does: for a promotion it takes the 5 knowledge notes nearest to the promotion's source memory, by their stored vectors, and the judge is told to reject a promotion that these notes already cover. [akm#1068](https://github.com/itlackey/akm/pull/1068) fences each block of that prompt with more backticks than the block holds, so that a note with a code block in it does not look cut off, and keeps the judge's reason on every verdict. The sandbox is indexed with embeddings for this (see "What a run does"). Same model as the baseline, `chat/qwen3.8-27b`, same day, 2026-10-07, eval commit `a86c84b` with the semantic index. The akm of the second and third run reports the version 0.9.26 too, since #1067 changed no version: the second is `main` at `6e2782827`, which is #1067 merged, and the third is #1068's branch (`fix/judgment-prompt-fence`) on top of it, both run as `AKM_BIN="bun <checkout>/src/cli.ts"`.

| | 0.9.26, keywords (baseline) | 0.9.26, semantic | #1067 | #1067 and #1068 |
|---|---:|---:|---:|---:|
| **own (65: 4 good, 61 bad)** | | | | |
| accepted | 44: 4 good, 40 bad | 44: 4 good, 40 bad | 15: 3 good, 12 bad | 16: 3 good, 13 bad |
| recall | 4/4 (100%) | 4/4 (100%) | 3/4 (75.0%) | 3/4 (75.0%) |
| precision | 4/44 (9.1%) | 4/44 (9.1%) | 3/15 (20.0%) | 3/16 (18.8%) |
| bad accepted | 40/61 (65.6%) | 40/61 (65.6%) | 12/61 (19.7%) | 13/61 (21.3%) |
| duplicate accepted | 27/40 (67.5%) | 29/40 (72.5%) | 2/40 (5.0%) | 2/40 (5.0%) |
| stale accepted | 9/14 (64.3%) | 8/14 (57.1%) | 6/14 (42.9%) | 7/14 (50.0%) |
| ephemeral accepted | 4/7 (57.1%) | 3/7 (42.9%) | 4/7 (57.1%) | 4/7 (57.1%) |
| bad rejected, deferred | 2, 19 | 2, 19 | 49, 0 | 47, 1 |
| seconds | 527 | 528 | 952 | 1,041 |
| **public (20: 6 good, 14 bad)** | | | | |
| accepted | 10: 4 good, 6 bad | 11: 4 good, 7 bad | 6: 5 good, 1 bad | 6: 4 good, 2 bad |
| recall | 4/6 (66.7%) | 4/6 (66.7%) | 5/6 (83.3%) | 4/6 (66.7%) |
| precision | 4/10 (40.0%) | 4/11 (36.4%) | 5/6 (83.3%) | 4/6 (66.7%) |
| bad accepted | 6/14 (42.9%) | 7/14 (50.0%) | 1/14 (7.1%) | 2/14 (14.3%) |
| duplicate accepted | 4/6 | 4/6 | 1/6 | 2/6 |
| stale accepted | 1/4 | 3/4 | 0/4 | 0/4 |
| ephemeral accepted | 1/4 | 0/4 | 0/4 | 0/4 |
| bad rejected, deferred | 7, 1 | 4, 3 | 12, 1 | 11, 1 |
| seconds | 238 | 163 | 233 | 245 |

No model call failed in any run (0 of 85 in each).

- **The semantic index does not move akm 0.9.26.** It accepted the same 44 of 65 and the same 40 bad ones on the own set, and 7 against 6 bad ones on the public set. That is the same as the keyword baseline, within the noise of a run (a few proposals): the old prompt never reads the index.
- **#1067 cuts the bad acceptances on the own set from 40 of 61 to 12.** The duplicates, which the prompt could not see, went from 29 of 40 accepted to 2. It also almost stopped deferring: the judge deferred 19 bad proposals on 0.9.26 and 0 or 1 under #1067, and it rejects most of what it used to leave for a person. The cost is one good proposal of the 4, which it rejects as largely redundant with its neighbours. Stale and ephemeral proposals are not helped much: 6 of 14 and 4 of 7 are still accepted, since the neighbours say nothing about whether a note is out of date. On the public set, whose duplicates are copies of notes that are in the library, it is 1 of 14 bad accepted, from 7.
- **#1068 changes nothing that this eval can measure.** 13 against 12 bad accepted on the own set, 2 against 1 on the public set, one proposal each way, which is noise. The judge rejected one good public proposal as cut off, `good-05`, in every run on this page. Its note really does end in an empty ```markdown block: the library note it was made from is cut off there, so that rejection is right, and it is not an example of the fence bug. The fence bug needs a note with a closed code block, and the lab's real case of 2 October is not in the set. Read the effect of #1068 from its test, not from this table.
- On this set the neighbours are easier to find than in a real bundle: `private/promotion/own/library` holds each case's nearest notes by tf-idf and the notes its reason names, and the eval writes the proposal as its own source memory, so the note it repeats is among the 5 nearest by construction. In the lab's 8,000 notes the nearest 5 may not hold the note a promotion repeats. The 5 nearest of a real promotion's memory, which is what akm uses, were not measured here.
- The proposals are judged in one drain, in queue mode: no accepted note joins the neighbours of the next. A real drain in promote mode writes each accepted note, and a later promotion of the same night sees it.

## Notes

- The shipped tier changes with akm. Compare results only between runs with the same akm version and the same model.
- Every proposal is judged in one drain, against one bundle. A proposal for a ref that another proposal also names would show that one to the judge as a sibling. The cases have a ref each, so none does.
- The bundle is indexed with akm's embedding model, bge-small-en-v1.5, which akm downloads once (133 MB) into `.cache/models/` at the root of the repository, as in the retrieval eval. The first baseline, below, was indexed with keywords alone. akm 0.9.26 does not look at the index when it judges, so the semantic index changes nothing for it, which the second table shows.
- akm's errors name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place in `samples.jsonl` and on the console, so results can be shared.
- The tier judges every proposal that no quality gate has passed: promotions, but also feedback fixes and extract memories. This eval queues promotions only.
- A promotion that the judge accepts can still fail when akm writes it, if the note does not validate. Queue mode does not write it, so the eval does not see that.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
