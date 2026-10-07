# promotion

Of the promotions consolidate proposes, how many does the drain's judgment tier accept, and are those the good ones?

`akm improve` has consolidate propose turning a memory into a knowledge note, a promotion. A person is meant to review it. With triage on, `applyMode: promote` and judgment on, which is how the lab runs, the drain does it instead: a model reads each promotion and accepts, rejects or defers it, and an accepted one is written to the bundle with no one looking. From 2026-09-29 to 7 October, 89 promotions reached that tier in the lab. It accepted 71, rejected 8 and left 10 for a person. On 7 October a person went through the 54 promotions that were waiting, and accepted 3. So most promotions are not worth keeping: they repeat a note the bundle already has, describe something that is gone, or record a status that is out of date in days. This eval measures what the tier does with them.

It gives the tier labelled promotions, good and bad, and counts which it accepts. The bad ones are of three kinds: a duplicate of a note that is already in the bundle, a stale note that describes something retired or superseded, and an ephemeral one that is a status snapshot or pinned to a commit or a version. It reports the share of the good proposals accepted (recall), the share of the accepted proposals that are good (precision), and the share of the bad ones accepted, for each kind.

The model under test is the judge of the tier. The prompt, the tier and the queue are akm's own: the eval runs `akm proposal drain --judgment` on a queue it has filled, so it follows the tier that your installed akm ships. It records the akm version it used. It was built on akm 0.9.26, whose prompt shows the judge the proposal, the note it would overwrite (none, for a new note) and any other pending proposal for the same ref. It does not show the notes of the bundle that the proposal may repeat, so it cannot see a duplicate unless the proposal says so. A change that shows the judge the nearest notes is what this eval is for: run it before and after, with the same model.

## What a run does

Each run makes a temporary folder with its own akm config and bundle, and:

```
copies the library's knowledge notes into the bundle, without the note each proposal would write
akm index --full
(writes each proposal into the pending queue, as a promotion of consolidate)
akm proposal drain --judgment --strategy promotion --yes
akm proposal list --status rejected --detail full        # the judge's reason for each rejection
```

- No command queues a proposal without a model, so the eval writes the rows into the `proposals` table of the sandbox's `state.db`, in the shape akm writes them, and checks that akm lists them all as pending.
- The config names one LLM engine, the model under test, and a strategy `promotion` whose triage block is the lab's: enabled, judgment on. It differs in one setting, `applyMode: queue`. A proposal the judge accepts is then staged, and not written. The tier decides the same either way, because the judge only judges: promote mode writes what it accepted afterwards, and promotion lint prints its findings and does not block (akm 0.9.26). Every proposal is judged against the same bundle, so the order does not matter, and no accepted note joins the neighbours of the next.
- A proposal is *accepted* when akm stages it, *rejected* when the judge rejects it, and *deferred* when the judge defers or gives no usable reply. A deferred proposal waits for a person, which is not an accept. A model call that fails is an error and is left out of the counts.
- akm keeps the judge's reason only for a rejection.

## Run

```
evals/promotion/run --corpus public
evals/promotion/run --corpus own
evals/promotion/run --corpus all
```

- `--corpus` picks the proposals. `public` is `assets/cases.jsonl` on `corpus/library`. `own` is your own set in `private/promotion/own/`: see "Run your own set". `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N proposals, taking one of each category in turn: good, duplicate, stale, ephemeral. Use it to check a setup.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

`own` sends your notes to the model, so it runs only when `MODEL_BASE_URL` is localhost, a private-network address (`10.*`, `172.16.*` to `172.31.*`, `192.168.*`) or a name that resolves only to such addresses, such as a gateway on your network. It stops with an error otherwise.

Each run writes two files to `evals/promotion/results/<UTC date>-<label>/`, or to `private/promotion/results/` for `own`:

- `summary.json`: the metrics, how many proposals ran and errored, the seconds the drain took, the model calls akm made (how many, how many failed, and the model names the endpoint reported), the model name, the akm version, the corpus and the git commit.
- `samples.jsonl`: one line per proposal, with its label and category, the ref, what the tier did, the judge's reason for a rejection, and the error when a call failed.

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

akm 0.9.26, the model `chat/qwen3.8-27b` (27B, on the lab's GPUs, through its gateway, thinking off), 2026-10-07, commit `f53402d`. The two corpora are never pooled.

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
- It accepted every good proposal in the own set, and 4 of 6 in the public one. With 4 good proposals, the recall of 100% says little. Of the public proposals it rejected, a good one and a duplicate were rejected as cut off: the note ends in a code block, and akm wraps the proposal in a ``` fence, so the fence ends early and the note looks cut off to the judge. A real promotion was rejected for the same reason on 2 October.
- A rerun differs. The same run before the code was committed (akm 0.9.26, the same model) accepted 40 of the 65, with 36 of the 61 bad: stale 6/14 against 9/14 now. On the public set it accepted the same 10, with stale 2/4 and ephemeral 0/4. Read differences of 4 proposals or fewer as noise.

## Notes

- The shipped tier changes with akm. Compare results only between runs with the same akm version and the same model.
- Every proposal is judged in one drain, against one bundle. A proposal for a ref that another proposal also names would show that one to the judge as a sibling. The cases have a ref each, so none does.
- The bundle is indexed with keyword search. akm's embedding model is not loaded, so a tier that finds the nearest notes by embedding falls back to keywords in this eval.
- akm's errors name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place in `samples.jsonl` and on the console, so results can be shared.
- The tier judges every proposal that no quality gate has passed: promotions, but also feedback fixes and extract memories. This eval queues promotions only.
- A promotion that the judge accepts can still fail when akm writes it, if the note does not validate. Queue mode does not write it, so the eval does not see that.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
