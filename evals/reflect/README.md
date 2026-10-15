# reflect

Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims?

`akm improve` has reflect revise an asset after negative feedback. Since akm 0.9.25-alpha.3 it edits frontmatter only: the model proposes a `description`, a `when_to_use` and a title, and akm keeps the body byte for byte. This eval gives reflect 80 notes whose right result is known. The model under test is reflect's engine; the prompt and patch are akm's own. Needs akm 0.9.25-alpha.3 or later; last run on 0.9.26.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/reflect/run
evals/reflect/run --model qwen3-27b
evals/reflect/run --corpus custom              # the rewrite: ./generate-assets --only reflect
evals/reflect/run --cases ~/notes/reflect
```

- `--limit N` runs the first N cases; the first ten hold each class once.
- `--strategy NAME` runs another strategy than `reflect-only`; `--config-patch FILE` changes the config (see "Measure akm's gates").
- `--retrieval-queries` gives each note the retrieval eval's labelled queries for it as searches that found it, so akm's retrieval check has something to grade. Public notes and their rewrite only. Collection version 0.4 uses the expanded retrieval judgments (77 of 80 notes); standard runs do not use this query context.

Each case gets its own akm sandbox and runs:

```
akm index
akm feedback <ref> --negative --reason "<the feedback>"
akm improve <ref> --strategy reflect-only --json-to-stdout
akm proposal list
akm proposal show <id> --detail full
```

`reflect-only` runs reflect alone with the quality judge off, so every proposal reaches the checks (judge-gate scores the judge). The model must return one JSON object; akm allows one repair turn. A case is up to about 6k tokens; 16k of context is safe. The eval sets temperature 0 and thinking off. A full run takes about a quarter of an hour on a local 27B.

## Run your own set

`--cases DIR`: a folder with a `cases.jsonl` in the format of `assets/cases.jsonl` (fields in `assets/README.md`).

## The cases

`assets/cases.jsonl`: 80 notes. 40 carry one injected defect of a kind akm names, in six classes; 40 are controls, in four. The rewrite changes each case's note, path, feedback, forbidden terms and anchors with one mapping, and `generate` checks that each rewritten note still holds exactly its defect. Cases keep their ids.

## How a case is scored

No judge model. Each check looks at the proposal and the note:

| Check | Applies to | Passes when |
|---|---|---|
| `body_kept` | every case | the body is unchanged, but for the one heading akm adds for a missing title |
| `defect_fixed` | defects | the defect is repaired and what the note said stays (per-class rules in `assets/README.md`) |
| `no_extra_change` | every case | no field changes but the one the class allows |
| `no_invented` | every case | every number, name, path or dotted name in a new value is in the note, and no forbidden term appears |
| `not_current` | `historical` | a new `when_to_use` does not offer the note for current work |

A case is correct when reflect gave a usable answer and every check passes, on the note as it ends up. `outcomes` per class: `proposal`, `none` (no change proposed), `refused` (a gate of akm refused the edit, scored as the note left alone), `unusable` (a reply akm could not read; never correct) and `error` (timeout, provider or akm failure, or a retrieval check that could not grade; left out of the counts).

| Metric | Meaning |
|---|---|
| `defects` | defect cases correct: how often reflect fixes what akm names |
| `controls` | control cases correct: how often it leaves a note alone, or changes it with care |
| `proposals` | proposals made, and `touched_body`, which should be 0 |
| `classes` | the same per class, with `outcomes` and `failed` checks |
| `refused` | refused edits by gate: `filter`, `judge`, `retrieval`, `other` |

For scale, with a scripted model on akm 0.9.26: never proposing anything fixes 0 of 40 defects and keeps 40 of 40 controls; rewriting every field fixes none and keeps none. One defect case or one control is 2.5 points, so a case or two is noise. `historical` is a known weak spot: read it on its own.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts` (akm past 15 minutes, or its retrieval check timing out), `retrieval_queries`, `served` (the model names the responses gave), `status` and `aborted_reason` (it aborts when the first five cases get no outcome), the model, akm version and build, `strategy`, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder` and the `manifest`. `samples.jsonl`: one row per case with the outcome, each check, the fields changed and their new text, the proposal, akm's reason, and the seconds.

## Measure akm's gates

A proposal passes three gates before it is queued. The eval runs with the first on and the others off; the patches in `patches/` change that.

| Gate | What it does | How to measure it |
|---|---|---|
| defect filter | refuses placeholder text, talk about the edit, or frontmatter copied into the body | `patches/defect-filter-off.json`, and the replay below |
| quality judge | refuses an edit that does not score 4 or more on every criterion | `patches/judge-on.json` |
| retrieval check | refuses an edit whose note grades lower on the queries that found it | `patches/judge-on.json` with `--retrieval-queries` |

Compare each gate on and off with `--repeat` on the same model:

```
evals/reflect/run --config-patch evals/reflect/patches/judge-on.json --label judge
evals/reflect/run --config-patch evals/reflect/patches/judge-on.json --retrieval-queries --label judge-queries
```

`evals/reflect/defect-filter --akm-src DIR` replays the defect filter of the akm checkout DIR on edits whose quality is known: `--reflect RESULTS_DIR` (a run made with `patches/defect-filter-off.json`; others are refused) or `--judge-gate public|private` (judge-gate's 106 labelled proposals). It prints, per set, how many good and bad edits the filter refused and by which rule. A replay reads each note from the cases here now, so it stops when the run read other cases; `--rescore` replays anyway and reports what differs.

## Notes

- `description-truncated` and `body-defect` are defects akm's rules reject but its problem list does not name. Reflect cannot change a body, so for `body-defect` the right result is no change.
- The library has no memories or lessons; the cases cover knowledge, skills, agents, commands and workflows.
- akm's error messages name its endpoint; the eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.

## Licence

MPL-2.0.
