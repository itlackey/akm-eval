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
- No command queues a proposal without a model, so the eval writes the rows into the `proposals` table of the sandbox's `state.db`, in the shape akm writes them, and checks that akm lists them all as pending.
- The config names one LLM engine, the model under test, and a strategy `promotion` whose triage block is the lab's: enabled, judgment on. It differs in one setting, `applyMode: queue`. A proposal the judge accepts is then staged, and not written. The tier decides the same either way, because the judge only judges: promote mode writes what it accepted afterwards, and promotion lint prints its findings and does not block (akm 0.9.26). Every proposal is judged against the same bundle, so the order does not matter, and no accepted note joins the neighbours of the next.
- A proposal is *accepted* when akm stages it, *rejected* when the judge rejects it, and *deferred* when the judge defers or gives no usable reply. A deferred proposal waits for a person, which is not an accept. A model call that fails is an error and is left out of the counts.
- akm 0.9.26 keeps the judge's reason only for a rejection; from 0.9.27-alpha.2 akm keeps it for accepts and defers too, and the eval records all three.

## Run

```
evals/promotion/run --corpus public
evals/promotion/run --corpus own
evals/promotion/run --corpus all
evals/promotion/run --cases ~/notes/night-2026-10-07
evals/promotion/run --corpus public --repeat 4
```

- `--corpus` picks the proposals. `public` is `assets/cases.jsonl` on `corpus/library`. `own` is your own set in `private/promotion/own/`: see "Run your own set". `all` runs both and prints the two results side by side, never as one number.
- `--cases DIR` runs the own corpus from DIR instead of `private/promotion/own/`: DIR holds `cases.jsonl` and `library/`, in the format of "Run your own set". Use it for a set built for one question, such as the promotions of one night. It is an own corpus in every way: it holds real notes, so it runs only against a local model (the same check as `own`, which says `--cases` in its refusal), and its results go to `private/promotion/results/` and report the corpus as `own`. A relative DIR is from the repository root. It cannot be combined with `--corpus public` or `all`.
- `--limit N` runs N proposals, taking one of each category in turn: good, duplicate, stale, ephemeral. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. Each run plants its own sandbox. See "Repeat a run" in the root README.
- `--strategy NAME` runs the akm strategy NAME in place of `promotion`, in the drain. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

`own` sends your notes to the model, so it runs only when `MODEL_BASE_URL` is localhost, a private-network address (`10.*`, `172.16.*` to `172.31.*`, `192.168.*`) or a name that resolves only to such addresses, such as a gateway on your network. It stops with an error otherwise.

Each run writes two files to `evals/promotion/results/<UTC date>-<label>/`, or to `private/promotion/results/` for `own`:

- `summary.json`: the metrics, how many proposals ran and errored, the seconds the drain took, the model calls akm made (how many, how many failed, and the model names the endpoint reported), the model name, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit.
- `samples.jsonl`: one line per proposal, with its label and category, the ref, what the tier did, the judge's reason (for a rejection, and from akm 0.9.27-alpha.2 for an accept or a defer too), and the error when a call failed.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the judge.

- It must follow an instruction to return one JSON object, `{"decision": "accept" | "reject" | "defer", "reason": ...}`. akm reads what lies between the first `{` and the last `}` of the reply. A reply it cannot read leaves the proposal deferred, and the eval cannot tell it from a defer.
- A call is the proposal plus about 300 tokens of prompt, so a note of 9 KB is about 3k tokens and 8k of context is safe.
- akm asks the server to turn thinking off. A model that thinks anyway is slow. If yours does, turn it off in the server.
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

## Assets

- `assets/cases.jsonl`: 20 proposals made from the knowledge notes of `corpus/library`: 6 good, 6 duplicate, 4 stale and 4 ephemeral. The fields and how they were made are in `assets/README.md`. They carry a canary string: do not train on them.
- `private/promotion/own/`: your own set, if you have one. See below.

The proposals are in `cases.jsonl`, and the notes they may repeat are the library's: a run copies `corpus/library/knowledge` into the bundle and takes out each note that a proposal would write.

## Run your own set

The public proposals have the cue that decides each one in their text, so they are easy: a model that cannot tell them apart is not usable, and one that can has shown little. The set that tests a judge is a labelled set of real promotions. Put it in `private/promotion/own/`. Nothing in `own/` is published. The folder holds:

- `cases.jsonl`: one proposal a line, with the fields of `assets/README.md`: `id`, `label` (`good` or `bad`), `category` (`good`, `duplicate`, `stale` or `ephemeral`), `ref` (`knowledge/<name>`) and `content` (the note as proposed, frontmatter and body). Strip the `generated:` and `verified:` lines that akm stamps into a note it accepts, so that an accepted note does not give its label away. Extra fields are ignored.
- `library/`: a folder with a `knowledge/` folder in it. It is copied into the sandbox as the bundle, and the note of each case is taken out, so put in the notes a proposal may repeat, such as the nearest notes of each. Notes of other types are not read.

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
