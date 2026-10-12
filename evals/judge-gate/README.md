# judge-gate

Does the quality judge pass good improve proposals and refuse bad ones?

`akm improve` has reflect propose revisions to your assets, and a judge model decides which go on to be accepted. This eval gives the judge 106 real revisions whose right answer is known, through `akm improve judge`, so the prompt, scoring and pass rule are those of the akm under test. The model under test is the judge. Needs akm 0.9.25-alpha.2 or later.

## Run

```
evals/judge-gate/run
evals/judge-gate/run --model qwen3-27b --repeat 3
evals/judge-gate/run --corpus custom          # the rewrite: ./generate-assets --only judge-gate
evals/judge-gate/run --cases ~/notes/judge-gate
```

`--limit N` keeps the good/bad proportion, with at least one of each from 2 cases on. `--strategy` and `--config-patch` change the akm config the eval writes. Two cases run at a time; akm gets 15 minutes a case.

The model must return one JSON object when asked. A case is up to about 7k tokens, so 16k of context is safe. The eval sets temperature 0 and thinking off; a model that thinks anyway is slow (about a minute a case on a 27B). Cloud endpoints that reject unknown request fields may refuse the thinking switches: run them through a local gateway.

## Run your own set

`--cases DIR`: a folder with a `cases.jsonl` in the format of `assets/README.md`.

## The cases

`assets/cases.jsonl`: 106 reflect proposals labelled under rubric version 2 (`assets/README.md`): 11 good and 95 bad, of which 67 `harmful` (a fact invented, reversed or dropped) and 28 `churn` (every fact kept, only the form changed). `assets/ADJUDICATION.md` records the labels version 2 changed. `bun evals/judge-gate/src/audit.ts` prints the set's make-up and checks the good cases against the rubric.

The custom rewrite changes names, numbers and the like across each case's source, candidate, feedback and label reason with one mapping, and `generate` checks that every label, diff size and quoted fact survives. It is the same 106 cases, not held-out data.

## How a case is scored

akm's verdict becomes an outcome: `pass`, `review` (not rejected, not good enough to pass alone), `reject` or `error`. Only `pass` counts as passed. A verdict of score -1 routed to review (the judge gave no readable verdict) counts as `review` with a null `score`. `error` is akm failing, timing out, or printing no verdict; errored cases are left out of the counts. The run stops, `aborted`, after 5 cases in a row with no verdict.

| Metric | Meaning |
|---|---|
| `good` | good revisions passed, of those with a verdict |
| `bad` | bad revisions passed, harmful and churn together |
| `bad_harmful` | revisions that invent, reverse or drop a fact, passed. The harm number |
| `bad_churn` | form-only revisions passed |
| `precision` | of everything passed, the share that was good |

`outcomes` splits each label by verdict. A judge that passes everything gets good 11/11, bad 95/95 and precision 10%. A change is worth keeping when `good` rises and `bad_harmful` does not. One case is 9.1 points of `good` and 1.5 of `bad_harmful`, so a gap of a case or two is noise.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts`, `status` and `aborted_reason`, `rubric_version`, the model, akm version and build, `strategy`, `config_patch`, the akm `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder` and the `manifest`. `samples.jsonl` has one row per case: the label and severity, akm's verdict as printed (or its error), the outcome, the criterion scores, the reason and the seconds.

## Notes

- The good set is narrow: 10 of the 11 change only the frontmatter, none edits the body. So `good` says whether the gate passes a clean frontmatter repair.
- Feedback is unbalanced: a judge that refused every case with a `[negative]` feedback line, judging nothing, would pass 11 of 11 good and 80 of 95 bad. Read `good` and `bad` against that, not against 100% and 0%.
- Results under rubric version 1 (no `rubric_version` in the summary) do not compare with these.
- `akm improve judge` reads feedback as negative only when the string starts with `[negative]`, so the eval puts negative lines first, as reflect does.
- To pair a rewritten case with its public one, use `private/judge-gate/map.json`.

## Licence

MPL-2.0.
