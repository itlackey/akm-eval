# pair-judge

Does consolidate's pair judge list the claims each note holds alone, so that akm retires only a note whose every claim the other keeps?

`akm improve` runs consolidate on your memories. Its pair pass finds two notes that say nearly the same thing and gives a judge model both, with their dates; the judge lists what each note states that the other does not, and akm derives the pair's relation from the two lists and retires a note only when the judge listed nothing that note holds alone. This eval gives the judge 112 pairs whose right lists are known, 108 of them pairs akm's pass sent on a real run, through `akm judge consolidate.pair`, so the prompt, the relation rule and the retirement rule are those of the akm under test. The model under test is the judge. Needs an akm with `akm judge` (0.10.261105 or later; not yet in a release, so akm main).

The consolidate eval measures this judge only through the whole consolidation: pairing, the judge, the retirement and the gate together. This one gives the judge a pair at a time and scores its lists.

## What the judge is given

Traced in akm `origin/main` (`cc4872fe8`, `src/commands/improve/consolidate/pair-pass.ts`). The pass takes each new or changed memory, flat knowledge note or lesson as an initiator, finds its nearest neighbours by embedding (at most 5, cosine 0.93 or more; 0.95 for an old note that has not been judged), and keeps those with the same scope that are not its own `.derived` twin. For each pair it reads both files, dates each note by git's first add of the file (the file time when the bundle is not a git repository) and `updated` from the frontmatter (else the created date), puts the older note first (with equal dates, the initiator), and calls `pairJudge.run({ a, b })`. An input is `{ a, b }`, each note `{ ref, type, created, updated, content }` with the whole file as `content`; the judge refuses an `a` created after `b`. It builds the user message from the two notes' ref, type, dates, description and body (the frontmatter is not sent whole), "A (older)" and "B (newer)", or "(same age as B)" and "(same age as A)" with an added rule when the dates are equal (akm#1134), and a list of the words only one note has. The system prompt is `consolidate-pair.md`. The judge replies with `reason`, `onlyInA`, `onlyInB` and `confidence`; akm derives the rest: `duplicate` when both lists are empty, `subsumed` when one is, with `redundant` naming that side, `overlap` when neither is.

The pass routes the verdict (`judgeOne`, `decideRetirement`): `duplicate` retires the older note, `subsumed` the redundant side, `overlap` nothing, and only when the judge listed nothing that side holds alone. A knowledge note is never replaced by a memory (it is turned round, or the pair is left). The guards after the judge (a `.derived` memory whose parent exists, a note already retired in the run, scope, the continuity check) need the bundle and are not the judge. A retire proposal is staged for unattended acceptance only after a second look, another prompt, `confirmNothingLost`; this eval stops at the judge's proposal. A verdict of `error` or `unparseable` is a failed judgment: the pass retires nothing, writes no ledger row for the initiator, and judges the pair again on a later run.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/pair-judge/run
evals/pair-judge/run --model qwen3-27b
evals/pair-judge/run --cases evals/pair-judge/assets/heldout   # the held-out part
evals/pair-judge/run --cases ~/notes/pair-judge
```

`--limit N` takes the kinds in turn, in file order. `--concurrency N` sets how many cases run at a time (default 2, all through one akm sandbox) and `--timeout-ms N` how many milliseconds akm gets for one (default 900000, 15 minutes). There is no `--strategy` (the judge runs on the default connection, as consolidate does with none configured) and no rewrite of the cases: `--corpus custom` needs `--cases`. It runs on a connection only; a harness run needs the isolation of #153, which is not built.

The model must return one JSON object when asked. A case is about 1.2k tokens in; the eval sets temperature 0 and the judge asks for no thinking. A model that thinks anyway is slow (a 35B model averaged 2.2k tokens out and 16 seconds a call in the smoke).

## The cases

`assets/cases.jsonl` (92) and `assets/heldout/cases.jsonl` (20): pairs of fictional memories, in six kinds: 24 `duplicate`, 22 `subsumed`, 19 `supersedes`, 16 `contradicts`, 21 `overlap` and 10 `lookalike` (two different things written to one layout). The notes are the 160 of consolidate's 80 cases and the 80 of its pool; the pairs are what akm's pass sent on a real run over them, 108 of the 115 pairs there are (80 cases and 35 pool pairs; the pass judged every pool pair), and 4 more are hand-written (the same pairs as long notes). 19 pairs have equal dates. The labels were drafted against the judge's prompt and reviewed independently; `assets/ADJUDICATION.md` records them, and its Review section settles the calls a reader might reverse. `assets/README.md` has the fields, the rubric, the claim matcher, the make-up and the limits. `assets/retired.jsonl` holds the 7 consolidate pairs the pass never judges (different subjects); the scorer does not read it.

`bun evals/pair-judge/src/reachable.ts --akm DIR` plants every case's notes in a sandbox, runs the pass with a stub model, and checks that it judges each pair, the older note first, with the gap between the dates the case has and the dates written as akm writes them (`AKM_CHECKOUT=DIR bun test evals/pair-judge/src/reachable.test.ts` runs it as a test). `src/capture.ts` is the pass run it uses.

**Held-out:** 20 ids, every fifth `pair-pass` case of each kind in id order, listed in `assets/README.md`. The default run does not score them; `--cases evals/pair-judge/assets/heldout` runs them. Run them to confirm a decision, not to choose it.

## How a case is scored

The case goes to `akm judge consolidate.pair` as `{ a, b }`, and the verdict becomes what the pass does with it:

- `retire`: a retire proposal is minted for the note `retiredSide` names (the pass's `decideRetirement` and the knowledge-over-memory rule). It is **safe** when that note is in the case's `safe`, and **unsafe** when it holds a claim the other note lacks.
- `keep`: a verdict, and nothing is retired.
- `failed`: the judge gave no verdict (`error` or `unparseable` from akm). The pass counts a failed judgment and retires nothing. It is not an akm failure, and it is not in the other rates; it has a rate of its own, and it finds no safe note.
- `error`: akm failed, timed out, or printed no envelope, which says nothing of the judge. Left out of the counts. The run stops, `aborted`, after 5 cases in a row that errored or got no verdict.

| Metric | Meaning |
|---|---|
| `unsafe` | **The headline, target 0.** Retirements of a note that holds a claim the other lacks, over the cases where one is possible: every case but the duplicates (a retirement of either note of a duplicate is safe). |
| `found` | Over the cases with a safe note (a duplicate, a subsumed pair, a replaced value): those where the judge led to retiring a safe one. The same as consolidate's `recall`. |
| `precision` | Of the retirements, the share that were safe. |
| `failed` | The judge gave no verdict, over the cases akm did not fail on. |
| `relation` | Of the cases with a verdict, those where the judge printed the labelled relation (and, for a subsumed pair, the labelled redundant side). `confusion` is the labelled relation by the one printed, and `by_kind` has each kind's retirements and relations. |
| `claims` | The claim lists against the labels: `labelled`, `found`, `listed`, `wrong_side` (an item that states a claim of the other note), `unlabelled` (an item that states no labelled claim: an upper bound on the claims it invented) and `unmatchable`. `found_rate` is found out of labelled. The matcher is `assets/README.md`'s. |
| `confidence` | The judge's `confidence` on verdicts with the labelled relation and on the others: n and mean of each, to show whether it is worth reading. |
| `seconds` | The mean seconds a call took. |
| `baselines` | `never_retire` (as the always-`unrelated` baseline of the issue: nothing unsafe, nothing found), `always_retire_older` (retires `a` every time, as consolidate's README does) and `most_common_relation` (always prints the labels' commonest relation). They read the labels, not a model. |

Tokens and cost are not in the verdict. `summary.json` has `model_calls`, from akm's own record of each call: calls, errors, and the mean prompt and completion tokens and seconds, and null where akm records none. akm reports no cost; it is unknown, not 0.

On the default run (92 cases), one case is 1.9 points of `found` (54 cases with a safe note) and 1.4 points of `unsafe` (72 exposed). A change is worth keeping when `found` rises and `unsafe` does not.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts`, `status` and `aborted_reason`, the model, akm version and build, `config_patch`, `concurrency`, `timeout_ms`, the akm `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `model_calls`, `assets_sha256` and the `manifest`. `samples.jsonl` has one row per case: the kind, the safe sides, what the pass did (`outcome`, `retired`, `retired_safe`), the relation labelled and printed, whether it is right, the claim tally, the reason, the seconds, and the verdict as akm printed it (or the judge's failure, or the error).

## Notes

- The measurement version is 0.1 (`MEASUREMENT_CHANGELOG.md`). A change to the cases, the labels, the input or the scoring bumps it.
- `src/score.ts` copies the pass's retirement rule (`retiredSide`), because the verdict does not carry the decision: the route is derived from `relation`, `redundant` and the lists. `scripts/rescore` scores a stored run again from the verdicts it holds, so a fix to the rule or a relabelled case applies to a stored run.
- What the 35B model did in a 10-case smoke is in the pull request. The consolidate eval's runs are not comparable: its metrics are of the whole consolidation.

## Licence

MPL-2.0.
