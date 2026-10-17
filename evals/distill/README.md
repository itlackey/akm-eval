# distill

Do distilled lessons say only what the source memory says?

`akm improve` has distill turn a memory into a lesson, which akm queues for a person to review. A good lesson states what the memory says, in fewer words, and nothing more. A memory that is only a dated status, repeats an asset the library holds, or is covered by a lesson already should get no lesson; one that adds a fact to an existing lesson should get an update to it.

This eval gives distill 96 fictional memories and checks what it queues, with deterministic checks and no judge model. The model under test is akm's engine: it writes the lesson and akm's own judge scores it. Built on akm 0.9.26; reads 0.9.31 the same way. The `lesson-update` class needs akm 0.10.0 (#1090): an older akm scores 0 of 40 on it and the other 56 cases as before. Needs a bun with `Bun.YAML`.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/distill/run
evals/distill/run --model qwen3-27b
evals/distill/run --corpus custom              # the rewrite: ./generate-assets --only distill
evals/distill/run --cases ~/notes/distill
```

`--limit N` takes cases from each class in turn, so a short run covers every class. `--strategy` runs another strategy than `distill-only`; `--config-patch` changes the config. A case takes 10 to 40 seconds on a local 27B (2 when skipped); a run about twenty minutes. `--concurrency N` runs N cases at a time, each in an akm sandbox of its own; the default is 1. `--timeout-ms N` stops an akm command that is still running after N milliseconds; the default is 900000 (15 minutes).

Each case gets its own akm bundle with the memory and any asset or lesson the case includes, then:

```
akm improve memories/<name> --strategy distill-only --no-sync --require-engines --json-to-stdout --format json
akm proposal list --status <state> --detail full      # pending, accepted, rejected, reverted
```

The model must return one JSON object; akm asks with a schema. An endpoint that answers an unservable schema with a 5xx makes every case error. A case is two calls and about 2k tokens. The eval sets temperature 0 and thinking off. akm runs with keyword search only.

## Run your own set

`--cases DIR`: a folder laid out like `assets/` (`cases.json` and `bundles/<id>/`; fields in `assets/README.md`). A lesson case needs `required` and `forbidden` lists and may add `contradicts`. A case may carry `"feedback": [{"signal": "positive"|"negative", "reason": "..."}]`, recorded with `akm feedback` before distill runs. Results go to `private/distill/results/`.

## The cases

| Class | Cases | The memory | A correct result |
|---|---:|---|---|
| `lesson-worthy` | 23 | a failure with a clear cause and a fix that worked | a lesson that states the listed facts, makes no forbidden claim, does not reverse the advice |
| `over-claim` | 17 | a result with a limit | the same, keeping the limit |
| `dated-status` | 6 | what was done or pending on a date | no lesson |
| `restates-asset` | 5 | the rules of a skill the library holds | no lesson |
| `duplicate-lesson` | 5 | a point a lesson in the case already makes | no lesson and no update |
| `lesson-update` | 40 | a lesson's rule plus one or two facts it lacks | one update that keeps every line and adds only those facts |

The rewrite changes the memories, library files and `cases.json` with one mapping, and `generate` checks every fact, claim and example lesson still scores as in the public case. Cases keep their ids.

## How a case is scored

For a case that expects a lesson, the lesson (description, `when_to_use` and body) must:

- exist: a skip, a judge's rejection or an invalid lesson means none;
- state each required fact. A fact is a list of phrases, any one of which states it. A phrase starting `+` is an action the lesson must assert, so a negation or prohibition right before it unstates it;
- make no forbidden claim, unless the claim is denied or doubted in its own clause;
- contradict nothing the memory shows (`contradicts`: the phrases that reverse its advice);
- be at most 1.5 times the memory's words, and repeat no more than three quarters of them word for word (`copied`).

Matching ignores case and punctuation; a word matches the start of a word, a number only itself, `*` up to three words, and `=word` that word only. Negations are read by the rule in `lib/negation.ts`, shared with extract. A phrase that rests on a negation the rule cannot read is listed in the row's `ambiguous` and counted, with the verdict unchanged: read those lessons. The checks are a lexical floor, not a semantic guarantee; each public case holds a `good`, a `bad` and a `reversed` example lesson that the tests score.

A case that expects none is right when nothing is queued (a skip or a rejection counts). An update (gate reason `distill-update`) is never counted as a lesson. A `lesson-update` case is `right` when one pending update sits on the existing lesson's ref, keeps every line, its added lines state the new facts, make no forbidden claim or contradiction and are not the memory pasted in, and no new lesson is queued.

| Metric | Meaning |
|---|---|
| `good_lessons` | lesson cases whose lesson passed every check, with `ambiguous` |
| `wrong_lessons` | cases that expect none where distill queued a lesson or update |
| `lesson_updates` | update cases right, with `checks` per check and `ambiguous` |
| `by_class`, `outcomes` | per class; what distill did (`lesson`, `update`, `skipped`, `rejected`, `invalid`, `error`) |
| `bad_by` | why lessons failed: `missing_fact`, `forbidden_claim`, `contradiction`, `too_long`, `copied` |

An `error` (timeout, endpoint, empty reply) is left out. Five errored cases in a row, in the order they finish, abort the run: no new case starts, the cases still running finish, `summary.json` says `aborted` and why, and the run exits 1. For scale: a distill that queues a lesson for every memory has `wrong_lessons` 16/16; one that queues nothing has `good_lessons` 0/40 and `wrong_lessons` 0/16; one that pastes the memory back fails every lesson on `copied`. One lesson case is 2.5 points, one update case 2.5, one no-lesson case 6: a case or two is noise.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts` (akm past the time limit), `concurrency` and `timeout_ms` (the limit, in milliseconds), `status` and `aborted_reason`, `served_models`, the model, akm version and build, `strategy`, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256` (over `cases.json` and every bundle file), `seed`, `corpus_folder` and the `manifest`. `samples.jsonl`: one row per case with the class, outcome, verdict, the lesson as queued, the facts missed, `forbidden`, `contradicted`, `ambiguous`, the length ratio, the gate's decision, the judge's `scores`, `calls`, the seconds, and the raw `improve` and `proposals` it was scored from. A rejected lesson's text is `rejected_lesson`, where akm reports it.

## Replay the pass bar

akm's judge scores a lesson 1 to 5 on `reusable` (`novelty` before 0.9.27-alpha.2), `nonRedundancy` and `grounding`. It passes when the first two are 4 or more; grounding counts only toward rejection.

`evals/distill/pass-bar [--rescore] [--cases DIR] RESULTS_DIR...` routes each judged lesson of distill runs under akm's bar (`shipped`) and one that puts grounding in the pass test (`with-grounding`), and counts the good and bad lessons that pass, go to review and are rejected under each. `mismatch` should be 0. It judges lessons by the cases and checks here now, so it reads a run only when its manifest's case digests match the cases now; `--rescore` reads it anyway and reports what differs.

## Notes

- akm's error messages name its endpoint; the eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- `served_models` lists the model names the responses gave, to spot a gateway that split a run.
- The public cases hold no feedback; a case of your own can.

## Licence

MPL-2.0.
