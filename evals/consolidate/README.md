# consolidate

Does consolidate retire only notes whose every claim the replacement keeps?

`akm improve` runs consolidate on your memories. Its pair pass finds two notes that say nearly the same thing, has a model list the claims each holds that the other lacks, and proposes retiring one. A retirement that loses a claim loses knowledge, and that is what this eval counts. It gives consolidate 80 pairs of notes whose right outcome is known, runs `akm improve --strategy consolidate`, and reads the retire proposals. The model under test is consolidate's engine. Written for akm 0.9.26, whose pair judge never retires a note that holds a claim of its own.

## How consolidate pairs notes

For each note, akm takes the nearest neighbours by embedding (at most 5) with a cosine of 0.93 or more (0.95 for an older note it has not judged). Only those pairs reach the judge, which labels a pair `duplicate`, `subsumed`, `supersedes`, `contradicts`, `overlap` or `unrelated`. akm retires a note only for the first three, and only when the judge listed nothing that note holds alone. It stages a duplicate with no claim of its own on either side, which a triage run then accepts unattended. A pair never paired is kept.

akm embeds the notes in one of two ways:

- By default with its deterministic word-hash embedder (`AKM_EMBED_DETERMINISTIC=1`). No model, the same pairs on every run. The cases were made to pair in this space.
- With `--semantic` with its real embedder, its built-in model bge-small-en-v1.5 (133 MB, downloaded once into `.cache/`), as a real bundle runs it. It can pair other notes, so a `--semantic` run is not comparable with a default one.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/consolidate/run
evals/consolidate/run --model qwen3-27b
evals/consolidate/run --corpus custom          # the rewrite: ./generate-assets --only consolidate
evals/consolidate/run --cases ~/notes/consolidate
evals/consolidate/run --semantic               # akm's real embedder, not the deterministic one
evals/consolidate/run --pool                   # the whole pool in one run, below
```

`--limit N` takes the first case of each relation in turn. `--strategy` and `--config-patch` change the akm config. `--concurrency N` runs N cases at a time, each in a sandbox of its own (default 1). `--timeout-ms N` stops an akm command that is still running after N milliseconds (default 1800000, which `improve` gets; `index` and `proposal list` keep their shorter limits, 2 minutes and 30 for the first `--semantic` index, and never get longer than N). Each case is up to three calls of about 1k tokens; the 80 cases take about 20 minutes on a local 27B, one at a time. On a 429 the eval retries a case with a growing wait, up to four times; a case the endpoint still turns away is an error like any other, so an endpoint that keeps rate limiting ends the run through the rule below and not, as it once did, at the first case it turns away. The eval sets temperature 0 and thinking off. The run gives up when five cases in a row end in an error: it starts no new case, writes the summary with `status: "aborted"` and the reason, and exits 1. It gives up too when akm paired none of the notes, since its judge then never ran.

## Run your own set

`--cases DIR`: a folder with a `cases.jsonl` in the format of `assets/cases.jsonl` (fields in `assets/README.md`).

## The cases

`assets/cases.jsonl`: 80 pairs of fictional memories, 13 or 14 for each relation, each with the sides safe to retire and the claims that decide it. The rewrite keeps relations, safe sides, ages and ids, and `generate` checks each deciding claim is still in its note and no other.

## How a case is scored

A retire proposal counts as a retirement, accepted or not. It is safe when the retired side holds no claim the other lacks. An errored case (akm failed, timed out, or paired the notes and its judge gave no verdict) is left out.

| Metric | Meaning |
|---|---|
| `unsafe` | cases where consolidate proposed retiring a note that held a claim of its own; `staged` of those were staged. The number to watch |
| `staged` | retirements akm staged for unattended acceptance, and `safe` of them |
| `precision` | safe retirements of those proposed |
| `recall` | of the cases with a safe note (duplicate, subsumed, supersedes), the share where one was retired |
| `classes` | per relation: `n`, `error`, `paired`, `judged_as`, `retired_safe`, `retired_unsafe`, `kept` |

For scale: retiring the older note of every paired pair gives 40 unsafe of 80, precision 33/73, recall 33/40; retiring nothing gives none and recall 0. One case is 1.25 points overall, 2.5 of recall and 7 or 8 within a relation. Seven of the fourteen `unrelated` pairs are on different subjects and are never paired. A kept `subsumed` or `supersedes` pair costs recall, not safety.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored, errored and paired, `timeouts`, `status` and `aborted_reason` (it aborts after five errored cases in a row, or when akm paired none of the notes), `embedder`, `served_models`, the model, akm version and build, `strategy`, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder`, `concurrency`, `timeout_ms` and the `manifest`. `samples.jsonl`: one row per case with the relation, the safe sides, whether akm paired the notes, the judge's label and reason, the side retired and whether it was safe and staged, the claim lists (`only_in_retired`, `only_in_successor`; null for a kept pair), the seconds, and the raw output it was scored from.

## Run on a whole pool (`--pool`)

A real night gives consolidate a whole pool: the pair pass finds pairs among all notes, the promote pass cuts the pool into chunks, and akm adds a few random notes to the chunks (`antiCollapse`). `--pool` writes the 80 memories of `assets/pool/` into one sandbox and runs a single `akm improve --strategy consolidate --no-sync`.

```
evals/consolidate/run --pool
evals/consolidate/run --pool --timeout-ms 600000 --label short-budget
evals/consolidate/run --pool --config-patch private/patches/anti-collapse-off.json
```

For the last, save `{ "improve": { "strategies": { "consolidate": { "processes": { "consolidate": { "antiCollapse": { "enabled": false } } } } } } }` as that file. With `--pool`, `--timeout-ms N` is akm's own wall-clock budget for the run (default 7200000, 2 hours, which akm uses when it is given none); a short one makes akm cut the pool for the promote pass, and the eval kills akm 10 minutes after the budget. The pool is one run, so there is no `--concurrency`, and the run fails when its `improve` does. `--pool` reads the public pool only, so it refuses `--corpus custom`, `--corpus all`, `--cases` and `--limit`; `--semantic` and `--label` work as above, and without `--label` the folder is named for the model and `-pool`. The folder holds `summary.json` (its `mode` is `pool`, as its manifest's is), `samples.jsonl` (one row per cluster) and `improve.json`, akm's own result of the improve run with the endpoint written `<MODEL_BASE_URL>`.

The pool has 47 clusters with known outcomes (`assets/pool/README.md`). A retirement is safe (allowed, for an allowed successor), wrong-successor, or unsafe (the note holds a claim no other has). Metrics: `unsafe`, `staged`, `precision`, `recall` (clusters with a note to retire, 19 of 47, where one safe retirement was proposed), `wrong_successor`, `classes`, `pairs`, `calls`, `chunks`, `anti_collapse_injected`, `cold_start_budget` and `warnings`. akm retires one note per chain in a run, so a triple of duplicates ends with one retirement and two failed judgments. One cluster is 5 points of recall. One pool run took about 4.5 minutes and 56 calls on akm 0.9.30.

## Notes

- consolidate's promote pass also runs in each case; its proposals are ignored here. `evals/promotion` tests what the drain does with them.
- The notes are about 100 words, 1 to 3 days old by file time. Real notes are longer and messier.
- The judge's own claim lists are not kept for a kept pair; akm records them only in a retire proposal.

## Licence

MPL-2.0.
