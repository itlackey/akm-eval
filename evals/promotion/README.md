# promotion

Of the promotions consolidate proposes, how many does the drain's judgment tier accept, and are those the good ones?

consolidate proposes turning memories into knowledge notes. With triage on, `applyMode: promote` and judgment on, a model in the drain accepts, rejects or defers each promotion, and an accepted one is written with no one looking. Most promotions are not worth keeping: in the lab a person accepted 3 of 54 waiting ones, while the tier had accepted 71 of 89. This eval plants labelled promotions in akm's queue, runs `akm proposal drain --judgment`, and counts which the tier accepts. The model under test is the tier's judge. Built on akm 0.9.26.

## What a run does

Each run makes an akm sandbox and:

```
copies library/knowledge of the corpus into the bundle, without the note each proposal would write
writes each proposal's note as the memory its promotion names: memories/<name>
akm index --full                                          # with akm's embedding model
(writes each proposal into the pending queue, as a promotion of consolidate)
akm proposal drain --judgment --strategy promotion --yes
akm proposal list --status rejected --detail full
```

The index uses akm's embedding model (133 MB, downloaded once into `.cache/models/`), so a judge that is shown a promotion's nearest notes (akm #1067 and later) finds them. The `promotion` strategy is the lab's triage block with `applyMode: queue`, so an accepted proposal is staged, not written; the judge decides the same either way. A proposal is *accepted* when akm stages it, *rejected* when the judge rejects it, and *deferred* when the judge defers or gives no usable reply. A failed model call is an error, left out of the counts.

## Run

```
evals/promotion/run
evals/promotion/run --model qwen3-27b --repeat 3
evals/promotion/run --cases ~/notes/night-2026-10-07
```

promotion has no rewrite: its custom corpus is `--cases DIR` only, and `--corpus custom` alone stops. `--limit N` takes one proposal of each category in turn. `--strategy` replaces `promotion` in the drain; `--config-patch` changes the config. One call per proposal, about 3k tokens; 20 proposals take 3 to 4 minutes on a local 27B. The judge must answer `{"decision": "accept" | "reject" | "defer", "reason": ...}`. The eval sets temperature 0 and thinking off.

## Run your own set

The public proposals carry the cue that decides each one in their text, so they are easy. A labelled set of real promotions tests a judge better. The folder holds:

- `cases.jsonl`: one proposal a line: `id`, `label` (`good` or `bad`), `category` (`good`, `duplicate`, `stale` or `ephemeral`), `ref` (`knowledge/<name>`) and `content` (the note as proposed). Strip the `generated:` and `verified:` lines akm stamps on accepted notes.
- `library/knowledge/`: the notes a proposal may repeat, such as the nearest notes of each.

Results go to `private/promotion/results/`.

## The cases

`assets/cases.jsonl`: 20 proposals made by `src/build.ts` from `corpus/library`: 6 good, 6 duplicate, 4 stale and 4 ephemeral, judged among the 30 notes of `assets/library/knowledge/`. A proposal's input digest includes the notes it was planted among, so a `--limit` run and a full run share no inputs.

## How a case is scored

| Metric | Meaning |
|---|---|
| `proposals` | proposals scored, and `share_good`, which is the precision of accepting everything |
| `accepted` | proposals accepted, and how many were good |
| `recall` | good proposals accepted |
| `precision` | accepted proposals that were good |
| `bad_accepted` | bad proposals accepted; `by_category` for `duplicate`, `stale`, `ephemeral` |
| `outcomes` | per label: `accept`, `reject`, `defer`, `error` |

An unreadable reply is a defer, so the eval cannot tell the two apart. One good proposal is 17 points of recall on the public set: a case or two is noise.

## What the summary reports

`summary.json`: `metrics`, the counts run and errored, `timeouts` (failed calls whose text says they timed out), `status` and `aborted_reason` (aborted when no proposal got a verdict), `calls` (model calls, failures and served model names, from akm's events table; null if unreadable), the drain's seconds, the model, akm version and build, `strategy`, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder` and the `manifest`. `samples.jsonl`: one row per proposal with its label, category, ref, `outcome`, the judge's reason (rejections only on 0.9.26; every verdict from 0.9.27-alpha.2) and any error.

## Depends on akm's private schema

No command queues a proposal without a model, so the eval writes rows into the `proposals` table of the sandbox's `state.db` (ten columns: `id`, `stash_dir`, `ref`, `status`, `source`, `created_at`, `updated_at`, `content`, `frontmatter_json`, `metadata_json`), and reads `event_type` and `metadata_json` of `events` to count calls. It checks the columns first and stops with a message naming what is missing. akm does not promise this schema, so a new build can break the eval without a word in its changelog; the tests use a fake akm and cannot see it. A run against the new build is the check.

## Results so far

The public runs on akm 0.10.261003-beta, three repeats, are in [`reports/0.10.261003-beta/promotion/`](../../reports/0.10.261003-beta/promotion/). The table below is older: `chat/qwen3.8-27b`, thinking off, 2026-10-07. The lab's own set has 65 real promotions (4 good, 61 bad).

| | 0.9.26 | #1067 (judge shown the 5 nearest notes) |
|---|---:|---:|
| own: accepted | 44: 4 good, 40 bad | 15: 3 good, 12 bad |
| own: duplicates accepted | 27/40 | 2/40 |
| own: stale, ephemeral accepted | 9/14, 4/7 | 6/14, 4/7 |
| public: accepted | 10: 4 good, 6 bad | 6: 5 good, 1 bad |

akm 0.9.26 shows the judge only the proposal, so a duplicate looks like any new note, and it almost never rejects. #1067 cuts duplicates sharply, at the cost of one good proposal; stale and ephemeral proposals are barely helped, since the neighbours say nothing about age. A semantic index alone changes nothing on 0.9.26. Reruns differ by up to 4 proposals.

## Notes

- Every proposal is judged in one drain, against one bundle, in queue mode, so no accepted note joins the neighbours of the next.
- The tier also judges feedback fixes and extract memories; this eval queues promotions only.

## Licence

MPL-2.0.
