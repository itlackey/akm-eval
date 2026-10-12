# nightly

Does a whole nightly improve run give good results unattended, with no model-call failures?

The other evals test one process of `akm improve` at a time. A real night runs them all on one library and nobody reads the result before morning. This eval runs one full night on a library of 35 planted items whose right outcome is known, checks each item, and checks the library as a whole: nothing outside the items changed, no distilled lesson was accepted without a person, and every model call got an answer. The model under test is the engine of every process; the strategy, prompts, gates and drain are akm's own. Needs akm 0.9.26 or later.

## The night

Each run plants the library in its own akm sandbox and runs:

```
akm index --full
akm feedback <ref> --negative --reason "<reason>"        # each item's feedback
akm improve --strategy default --require-engines --no-sync --timeout-ms 2700000 --json-to-stdout
akm proposal drain --promote --strategy default --yes
akm proposal list --status <state> --detail full
```

`default` is the strategy akm ships. Its processes:

- **consolidate**: the pair pass proposes retiring a note whose claims its pair keeps, and stages a duplicate with no claim of its own; the promotion pass's proposals wait for a person (triage is off) and are not counted. `evals/promotion` tests what a judgment tier does with them.
- **reflect**: edits the frontmatter of notes with negative feedback; a quality judge stages the edits it passes.
- **distill**: writes lessons from memories with feedback, judged and sent to a person, never accepted by akm.
- **the proactive lane**: plans up to 15 assets with no feedback, and reflect proposes fixes that wait for a person. The `silent` items are defects only it can reach. To measure it, run with `--config-patch` holding `{"improve":{"strategies":{"default":{"processes":{"proactiveMaintenance":{"enabled":false}}}}}}`, and again with `{"enabled":true,"maxPerRun":50}`.
- **validation**: calls a model only to repair a fault; the planted notes have none.

The drain accepts what the gates allowed: a staged duplicate retirement and a reflect edit its judge passed. `--embedder deterministic|real` works as in `evals/consolidate`; the night's pairs were made in the hash space, so a `real` run is not comparable with a `deterministic` one.

## Run

```
evals/nightly/run
evals/nightly/run --model qwen3-27b --repeat 3
evals/nightly/run --corpus custom              # the rewrite: ./generate-assets --only nightly
evals/nightly/run --cases ~/notes/nightly
```

`--limit N` plants N items, the first of each kind in turn (pair, reflect, distill, fix, untouched). `--strategy` replaces `default` in improve and the drain; `--config-patch` changes the config. A night is about 40 calls, one at a time, of up to 6k tokens; about five minutes on a local 27B. akm's budget is 45 minutes: refs it does not reach show `not reached`. If akm runs 10 minutes past its budget the eval kills it and the night fails with no summary. An endpoint that answers an unservable schema with a 5xx fails every distill call. The eval sets temperature 0 and thinking off.

## Run your own set

`--cases DIR`: a folder with an `items.jsonl` and a `library/` in the format of `assets/` (see `assets/README.md`).

## The items

| Kind | Items | The item | A right night |
|---|---:|---|---|
| `pair` | 7 | two memories of known relation | a duplicate retired by the drain (either note); a subset or replaced note's retirement proposed and waiting; otherwise both kept, nothing proposed |
| `reflect` | 10 | a note with negative feedback: 6 with a defect akm names, 4 controls | a defect fixed and applied, passing the reflect eval's checks; a control unchanged or changed only as its class allows |
| `fix` | 1 | a wrong fact, with exact-fix feedback (`--replace`, `--with`, `--source`) | exactly that edit, applied (akm 0.10) or waiting as a proposal (0.9.26) |
| `distill` | 7 | a memory with positive feedback: 3 deserve a lesson, 4 do not | a good lesson waiting for review, or none; never one accepted |
| `untouched` | 4 | notes with nothing wrong and no feedback | exactly as they were |
| `silent` | 6 | a defect with no feedback | a pending proposal that fixes it, and the note as planted |

`src/build.ts` built the night from the consolidate, reflect and distill cases. The rewrite changes the library and `items.jsonl` with one mapping, and `generate` checks every item still holds as those evals check theirs.

## How an item is scored

No judge model. Each check reads the library as the night left it and the proposals in every state. A failed check that guards the library is *harm*; the others are *misses*.

| Check | Applies to | Passes when | Fails as |
|---|---|---|---|
| `no_unsafe_retirement`, `note_kept`, `survivors_unchanged` | pair | no note with a claim of its own is gone, one note remains, survivors are as planted | harm |
| `no_unsafe_proposal`, `right_outcome` | pair | no unsafe retirement proposed; the outcome above | miss |
| `body_kept`, `no_extra_change`, `no_invented` | reflect | the reflect eval's checks, on the note as left | harm |
| `defect_fixed`, `not_current` | reflect | the reflect eval's checks | miss |
| `fix_done` | fix | the note is as the fix makes it, or a pending proposal would make it so | miss |
| `only_the_fix` | fix | the note is the fixed note or as planted | harm |
| `lesson_queued`, `lesson_good` | distill, lesson cases | a lesson queued that passes the distill eval's checks | miss |
| `no_lesson` | distill, other cases | no lesson queued | miss |
| `lesson_not_accepted`, `memory_kept` | distill | no lesson accepted or written; the memory's body as planted | harm |
| `unchanged` | untouched, silent | the files exactly as planted | harm |
| `fix_proposed` | silent | the latest pending reflect proposal passes the reflect eval's checks | miss |
| `no_error` | reflect, distill | akm reported no error for the item | miss |

| Metric | Meaning |
|---|---|
| `items` | items whose every check passed |
| `by_kind`, `failed` | the same per kind; failures per check |
| `harm` | `items` with a harm check failing, `outside_changed` paths no item owns that changed, `lessons_accepted`. All should be 0 |
| `calls` | model calls and `failures`, which should be 0 |
| `proactive` | the lane's `selected` of `due` refs, and its proposals `on_silent` and `on_others` |

For scale: a night that does nothing gets 15 of 35 right and no harm. One item is 2.9 points: an item or two is noise.

## What the summary reports

`summary.json`: `metrics`, the seconds of each step, what the drain did (`drain`), the pair judge's labels (`pair_pass`), `outside_changed`, `calls_by` (by process and served model), `embedder`, the model, akm version and build, `strategy`, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder` and the `manifest`. `status` is always `complete`: a night that fails writes no summary. `samples.jsonl`: one row per item with its checks, a few words on what the night did, the lesson or edit and gate decision behind them, and the raw output it was scored from (the item's files before and after, its proposals and actions, and the shared part of the night).

## Notes

- The library holds only the planted notes, not `corpus/library`; the untouched notes and the check of every other path stand in for a background.
- Items share one night, so a pair can be paired with another item's note; the made-up subjects make that rare.
- A retirement archives the note under `.akm/`; the eval leaves that folder out of its reading.

## Licence

MPL-2.0.
