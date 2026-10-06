# nightly

Does a whole nightly improve run give good results unattended, with no model-call failures?

The other evals test one process of `akm improve` at a time, each on cases of its own. A real night runs them all on one library, one after another, and nobody reads the result before the morning. This eval runs one full night on a library of 29 planted items whose right outcome is known in advance, and checks every one: pairs of notes for consolidate to retire or keep, notes with a defect and notes that should stay as they are for reflect, memories for distill to turn into lessons or leave, an exact fix, and notes that nothing should touch. It then checks three things about the library as a whole: nothing outside the items changed, no distilled lesson was accepted without a person, and every model call akm made got an answer.

The model under test is the engine of every process: consolidate's pair judge, reflect and its quality judge, distill and its judge. The strategy, the prompts, the gates and the drain are akm's own: the eval drives the installed akm CLI the way the lab's nightly does. It is written for akm 0.9.26 and records the akm version it used. akm is on `PATH`, or named in `AKM_BIN`.

## The night

Each run makes a temporary folder with its own akm config, plants the library in it as the only bundle, and runs, in this order:

```
akm index --full
akm feedback <ref> --negative --reason "<reason>"        # what each item has on record: the day before the night
akm improve --strategy default --require-engines --no-sync --timeout-ms 2700000 --json-to-stdout
akm proposal drain --promote --strategy default --yes
akm proposal list --status <state> --detail full         # for each state
```

`default` is the strategy akm ships, and the one the lab runs. It runs four processes:

- **consolidate** has a pair pass and a promotion pass. The pair pass finds memories, lessons and flat knowledge notes that say nearly the same thing, has a model list the claims each holds that the other lacks, and proposes retiring a note that holds none. The pair judge stages a retirement only for a duplicate that has no claim of its own on either side, after a second look. The promotion pass proposes turning memories into knowledge notes. Those proposals are never accepted without a person, and the eval does not count them.
- **reflect** acts on notes that have negative feedback and edits their frontmatter only: a `description`, a `when_to_use` and a title. A quality judge reads each edit and stages the ones it passes.
- **distill** acts on memories that have feedback, unless it is only a positive with no reason. It writes a lesson and has a judge look at it. A lesson goes to a person for review. akm never accepts one by itself.
- **validation** checks that each asset has a file and each lesson a description. It calls a model only to repair a fault, and the planted notes have none.

Memory inference needs an experimental switch and stays off. Triage is off in this strategy: the drain does its work. `akm proposal drain --promote` accepts what the gates allowed and leaves the rest: a retirement the pair judge staged as a duplicate, and a reflect edit that its judge passed. A proposal the drain does not accept waits for a person. The lab's nightly drains at the start of the next night. The eval drains straight after improve, to see the result of both.

The config names one LLM engine, the model under test, for every process, and turns semantic search on, because the pair pass finds its pairs among the nearest neighbours of a note by embedding. akm's deterministic embedder (`AKM_EMBED_DETERMINISTIC=1`) stands in for an embedding model. It hashes words, needs no model and no download, and pairs the same notes on every run. It is akm's switch for reproducible benchmarks, not what a real library uses: a real embedding model gives other cosines. See `../consolidate/README.md`.

## Run

```
evals/nightly/run --corpus public
evals/nightly/run --corpus private
evals/nightly/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number. It sends both to the one model in `.env`, so use a local model for it.
- `--limit N` plants only N items, taking the first of each kind in turn, in the order pair, reflect, distill, fix, untouched. Use it to check a setup. `--limit 3` is a duplicate pair, a reflect defect and a distill memory.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/nightly/assets/`. Make it first with `./generate-assets --only nightly`. The run stops with an error when it is missing.

Each run writes two files to `evals/nightly/results/<UTC date>-<label>/`, or to `private/nightly/results/` for the private corpus:

- `summary.json`: the metrics, the seconds each step took, the akm version, the model name, the corpus and the git commit. It also holds what the drain did, the pair judge's labels, the paths that changed outside the items, and the model calls by process and by the model name the endpoint reported.
- `samples.jsonl`: one line per item, with the checks it passed and failed, what the night did to it in a few words, and the facts behind the checks: the lesson as queued, the fields a reflect edit changed and their new text, the proposal's gate and the judge's reason, and the error when a model call failed. The texts let you score a result again when the checks change.

A night is about 40 model calls, one at a time. A full night took about 100 seconds on a hosted 120B model, whose distill calls all failed. 12 items took 85 seconds on a 27B model on a local GPU, 18 calls in all, so a full night on that model should take about five minutes. The budget akm gets for the run is 45 minutes. When it runs out, akm skips the refs it has not reached: their items show `not reached`, and the first of them carries the error.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the judge in every process.

- It must follow an instruction to return one JSON object. akm asks for strict JSON with a schema, and goes on without one if the endpoint refuses it with a 4xx. An endpoint that answers a schema it cannot serve with a 5xx cannot be used: akm does not retry that, and every distill call of the night fails. One hosted route did this for the lesson schema that akm 0.9.26 sends. The failures show in `calls`, and each distill item is not right.
- A call is up to about 6k tokens, so 16k of context is safe. The largest are reflect's, which carry a whole note, and consolidate's chunk of up to 12 memories.
- akm asks the server to turn thinking off. A model that thinks anyway is slow. If yours does, turn it off in the server.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect failed calls.
- akm retries a transient failure once. A call that still fails is a failed call.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 16384 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

## Assets

- `assets/library/` and `assets/items.jsonl`: the planted night, 29 items in 38 files, built from the cases of the consolidate, reflect and distill evals by `src/build.ts`. The items, the fields and how it was made are in `assets/README.md`. The items carry a canary string: do not train on them.
- `private/nightly/assets/`: the same night with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`, with one mapping for the library and `items.jsonl`, so a name or a number changes the same way in a note, in a path, in a claim, in a feedback and in what a correct result must say. `generate` then checks the night as the three evals check theirs: each file is where its item says, each deciding claim of a pair is still in the note it belongs to and in no other, each planted defect is still there and only that one, each exact fix still applies once, and each distill memory still matches the facts and claims it did. It writes nothing if one check fails, and says to try another seed. The mapping is in `private/nightly/map.json`. It is made by `generate` and never published.

| Kind | Items | The item | A right night |
|---|---:|---|---|
| `pair` | 7 | Two memories whose relation is known by construction: 2 duplicates, a subset, a note that a newer one replaces, a pair that contradicts, a pair that overlaps, and a pair about two different things written to one layout. | Duplicate: the drain retires one note, either, and the other stays as it is. Subset or replaced: a retirement of the note that says less, or of the older one, is proposed and waits for a person. Contradict, overlap and unrelated: both notes stay and nothing is proposed. |
| `reflect` | 10 | A note with negative feedback: 6 with a defect akm names (a period in the description, escaped quotes, a cut-off description, a missing description, `when_to_use` or title) and 4 controls (a miss of search, an ask the note does not support, a historical note, frontmatter copied into the body). One case of each class of the reflect eval. | A defect: the judge passes reflect's edit, the drain applies it, and the note passes the reflect eval's checks. A control: no change, or the one change its class allows. |
| `fix` | 1 | A note with a wrong fact planted in its body, and negative feedback with the exact fix: `--replace`, `--with` and `--source`, new in akm 0.9.26. | The fix is queued as a proposal that makes exactly that edit, and waits for a person. The night does not apply it, and does not change the note. |
| `distill` | 7 | A memory with positive feedback and a reason. 3 deserve a lesson. 4 do not: 2 dated statuses, one that restates a skill the library holds, one whose point a lesson of the library makes. | A lesson that states the facts of its memory and claims nothing more, waiting for review. For the others, no lesson. Never a lesson accepted. |
| `untouched` | 4 | 2 memories and 2 knowledge notes with no feedback, no pair and nothing wrong. | Exactly as they were. |

## The checks

No judge model scores an item. Each check looks at the library as the night left it and at the proposals in every state. A check that guards the library is *harm* when it fails: something was lost, invented or changed that should not have been. The others are *misses*: the night did less than it should.

| Check | Applies to | Passes when | When it fails |
|---|---|---|---|
| `no_unsafe_retirement` | pair | No note that holds a claim the other lacks has gone from the library. | harm |
| `note_kept` | pair | At least one of the two notes is still there. | harm |
| `survivors_unchanged` | pair | Each note that is still there is as planted. | harm |
| `no_unsafe_proposal` | pair | No retirement is proposed, accepted or not, for a note that holds a claim the other lacks. | miss |
| `right_outcome` | pair | The outcome in the table above. | miss |
| `body_kept`, `no_extra_change`, `no_invented` | reflect, fix | The reflect eval's checks, on the note as the night left it: the body is the note's body, no field changed but the one the class allows, no new number, name or path the note lacks. | harm |
| `defect_fixed`, `not_current` | reflect | The reflect eval's checks: the defect is repaired and what the note said stays, and a historical note is not offered for current work. | miss |
| `fix_queued` | fix | A proposal from the feedback makes the note as the exact fix says, apart from the `type:` line akm adds. | miss |
| `fix_waits` | fix | Every such proposal is still pending. | miss |
| `lesson_queued`, `lesson_good` | distill, lesson cases | A lesson is in the queue, and it states each required fact, makes no forbidden claim and is not much longer than its memory: the distill eval's checks. | miss |
| `no_lesson` | distill, other cases | No lesson was queued for the memory. | miss |
| `lesson_not_accepted` | distill | No lesson proposal was accepted, and no lesson file was written. | harm |
| `memory_kept` | distill | The memory's body and the item's other files are as planted. akm stamps a salience score into the frontmatter of a memory it distills, and that is allowed. | harm |
| `unchanged` | untouched | The files are exactly as planted. | harm |
| `no_error` | reflect, distill | Added, failing, when akm reports an error for the item: a model call failed, or the run's budget ran out at it. An item that was not decided is not right, even when it expects no change. | miss |

## Read the results

| Metric | Meaning |
|---|---|
| `items` | `ok` of `n` items whose night went as expected: every check passed. |
| `by_kind` | The same for each kind. |
| `failed` | For each check, how many items failed it. |
| `harm` | `items`: items with a check that guards the library failing. `outside_changed`: paths no item owns that changed, appeared or vanished. `lessons_accepted`: distill proposals accepted. All three should be 0. |
| `calls` | `n` model calls the improve run made and `failures`, how many failed. It should be 0. `calls_by` in `summary.json` splits them by process and by the model name the endpoint reported. |

The calls come from akm's own usage report. A gateway may serve one model name from several providers, and each call is filed under the name that answered. A call that got no answer has none, and is filed under the name it asked for with no tokens, so the failures show under that name.

For scale: a night that does nothing gets 15 of 29 items right and no harm: the 3 pairs to keep, the 4 controls, the 4 memories that deserve no lesson and the 4 notes to leave alone. A useful night gets the duplicates retired, most defects fixed, the exact fix queued, the good lessons queued, and no harm and no failed call.

The set is small. One item is 3.4 points of 29, and a kind has between 1 and 10 items. Read changes of an item or two as noise, and rerun before you trust a gap. A rerun can differ by an item or two, because the model judges and writes again.

A model may have seen the public night in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- The library holds only the planted notes. It does not hold `corpus/library`. akm plans reflect and distill only for notes that have feedback, and the pair pass reads only memories, lessons and flat knowledge notes, so the 317 files of `corpus/library` would add index time and no model call. The notes that nothing should touch, and the check of every other path, cover what the background would.
- All the items share one night, as they do in a real library. A pair judged in the same run as the others can be paired with a note of another item; the pairs are different made-up systems, so that is rare. The step 2 evals give each case a library of its own.
- The pair judge's label of a pair is known only for a pair that was retired. `summary.json` holds the labels of the run.
- A retirement archives the note under `.akm/` in the bundle, and nothing is deleted. The eval leaves akm's own folder out of its reading of the library.
- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so results can be shared.
- The shipped strategy, judges and gates change with akm. Compare results only between runs with the same akm version.
- The private items keep their ids, so a private item pairs with its public one by id. `private/nightly/map.json` lists what was renamed.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
