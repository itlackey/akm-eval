# judge-gate

Does the quality judge pass good improve proposals and refuse bad ones?

`akm improve` has reflect propose revisions to your assets' frontmatter, and a judge model decides which go on to be accepted. This eval gives the judge 188 revisions whose right answer is known, each one a revision that reflect can write today, through `akm judge reflect.quality`, so the prompt, scoring and pass rule are those of the akm under test. The model under test is the judge. Needs an akm with `akm judge` (0.10.261105 or later; not yet in a release, so akm main).

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/judge-gate/run
evals/judge-gate/run --model qwen3-27b
evals/judge-gate/run --corpus custom          # the rewrite: ./generate-assets --only judge-gate
evals/judge-gate/run --cases ~/notes/judge-gate
```

`--limit N` keeps the good/bad proportion, with at least one of each from 2 cases on. `--strategy` and `--config-patch` change the akm config the eval writes. `--concurrency N` sets how many cases run at a time (default 2, all through one akm sandbox) and `--timeout-ms N` how many milliseconds akm gets for one (default 900000, 15 minutes).

The model must return one JSON object when asked. A case is up to about 7k tokens, so 16k of context is safe. The eval sets temperature 0 and thinking off; a model that thinks anyway is slow (about a minute a case on a 27B). Cloud endpoints that reject unknown request fields may refuse the thinking switches: run them through a local gateway.

## Run your own set

`--cases DIR`: a folder with a `cases.jsonl` in the format of `assets/README.md`.

## The cases

`assets/cases.jsonl`: 188 reflect revisions labelled under rubric version 3 (`assets/README.md`): 91 good and 97 bad, of which 71 `harmful` (a fact invented, reversed or dropped, or a dated note offered as current), 25 `churn` (nothing needed fixing and every fact kept) and 1 `other`. Every candidate is `applyReflectPatch`'s output, so it is exactly what reflect would send the judge: the body is the source's, and only the `description`, the `when_to_use` and a title heading change. 149 are real revisions from reflect runs (judge off) on a 35B model, 36 are earlier cases rebuilt the same way and 3 were written (see the known limits in `assets/README.md`). 156 carry a `[negative]` feedback line. `assets/ADJUDICATION.md` records the labels version 3 changed and the calls a maintainer might reverse. `assets/retired.jsonl` holds the 101 cases of earlier versions that reflect can no longer produce; the scorer does not read it. `bun evals/judge-gate/src/audit.ts` prints the set's make-up. `bun evals/judge-gate/src/reachable.ts --akm DIR` checks that every candidate is still what that akm writes (`--rebuild` writes them again); `AKM_CHECKOUT=DIR bun test evals/judge-gate/src/reachable.test.ts` runs the same check as a test.

The custom rewrite changes names, numbers and the like across each case's source, candidate, feedback and label reason with one mapping, and `generate` checks that every label, diff size and quoted fact survives. It is the same 188 cases, not held-out data.

## How a case is scored

The case goes to `akm judge reflect.quality` with its feedback as lines and its `ref`, and akm's verdict becomes a route, the one reflect takes: `pass` (every criterion 4 or more; on the `negative` lane `akm proposal drain` accepts it unattended), `review` (`verdict.reviewNeeded`: a person decides), `reject` (no proposal; a rejection window is recorded) or `error`. A judge that gave no verdict (`error` or `unparseable` from akm, score -1) is a `review` with a null `score`. `error` is akm failing, timing out, or printing no verdict; errored cases are left out of the counts. The run stops, `aborted`, after 5 cases in a row that errored or got no verdict.

The route is the verdict's own: reflect's 3.5 review floor is in `reviewNeeded` (akm#1418, `reflect.quality` schemaVersion 2), and the scorer copies no threshold. The run stops before its first case on an akm whose `reflect.quality` is not at schemaVersion 2, and each stored verdict carries its `schemaVersion`: `scripts/rescore` refuses a run without it, because a run from before #1418 holds `reviewNeeded` over the wider 2.5 band, and would move a third of its rows from reject to review. Run the baseline again on an akm that has #1418 (measurement 0.5; `MEASUREMENT_CHANGELOG.md`).

| Metric | Meaning |
|---|---|
| `harmful_auto_accepted` | harmful revisions passed on the `negative` lane. The headline: what the gate lets in unattended |
| `good` | good revisions passed |
| `good_rejected` | good revisions the gate refuses outright: work lost, and a rejection window |
| `review_share` | the share of all cases sent to a person |
| `bad` | bad revisions passed, harmful, churn and other together |
| `bad_harmful` | harmful revisions passed on either lane |
| `bad_churn` | churn revisions passed |
| `precision` | of everything passed, the share that was good |

`routes` splits pass, review and reject by label, severity (`good`, `harmful`, `churn`, `other`) and lane (`negative`, `maintenance`); on the `maintenance` lane (no `[negative]` line) a pass is accepted unattended too on an explicit `akm improve <ref>` run (the `scope` lane) and goes to a person only on the proactive lane, so `harmful_auto_accepted` leaves those cases to `routes`, where the maintenance harmful passes can be read. `outcomes` splits each label by route. A judge that passes everything gets good 91/91, bad 97/97 and precision 48%. A change is worth keeping when `good` rises and `harmful_auto_accepted` does not. One case is about 1.1 points of `good` and 1.6 of `harmful_auto_accepted` (1 of 64 negative-lane harmful cases), so a gap of a case or two is noise.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts`, `status` and `aborted_reason`, `rubric_version`, the model, akm version and build, `strategy`, `config_patch`, `concurrency`, `timeout_ms`, the akm `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder` and the `manifest`. `samples.jsonl` has one row per case: the label and severity, akm's verdict as printed (or its error), the outcome, the criterion scores, the reason and the seconds.

## Notes

- Feedback is unbalanced: 156 of the 188 cases carry a `[negative]` line. A judge that refused every one of them, judging nothing, would pass 22 of 91 good and 10 of 97 bad. Read `good` and the harm numbers against that, not against 100% and 0%.
- The feedback goes to akm as lines in the order the case has them, as reflect passes them; the eval no longer moves the negative lines first.
- Results under rubric version 1 or 2 (a `summary.json` with no `rubric_version`, or 1 or 2) do not compare with these: the inputs, the labels and the routing changed (`MEASUREMENT_CHANGELOG.md`). The 13 judge-gate rounds published before version 3 are marked in `reports/README.md`.
- To pair a rewritten case with its public one, use `private/judge-gate/map.json`.

## Licence

MPL-2.0.
