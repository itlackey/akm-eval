# drain-judge

Does the drain's judgment accept the promotions worth keeping, and reject the ones that are not?

`akm improve` has consolidate turn memories into knowledge notes (promotions). A promotion that no quality judge has passed goes to the proposal drain, whose judgment tier is a model that accepts, rejects or defers it, and an accepted promotion is written with no one looking. Most promotions are not worth keeping: in the lab a person accepted 3 of 54 waiting ones, while the tier had accepted 71 of 89. This eval gives that judgment one frozen promotion at a time, through `akm judge proposal.judgment`, so the prompt and the parsing are those of the akm under test, and a change to the judgment is not mixed with the drain's routing (the promotion eval measures the two together). The model under test is the judge. Needs an akm with `akm judge` and `proposal.judgment` at schemaVersion 1 (0.10.261105 or later; not yet in a release, so akm main).

## What akm sends the judge

Traced in akm `src/commands/proposal/drain.ts` (`runJudgmentTier`, `buildJudgmentPrompt`, `judgmentJudge`) and `src/commands/improve/consolidate.ts` (`emitPromotionProposal`) on akm main (cc4872fe8).

- **The proposal.** consolidate's promote pass reads a memory, takes its description (the planner's, else the memory's own), and mints a pending proposal with `source: "consolidate"`, the ref `knowledge/<slug>` (stored as `<bundle>//knowledge/<slug>`, and the judge sees that), and as content the memory's own frontmatter with `description` and `xrefs: [memories/<name>]` merged in, then the memory's body. The mint skips a memory whose body is under 100 characters, one already in `knowledge/`, one whose slug or body is pending, a superseded one, and one where a nearby knowledge note holds at least 30% of its five-word runs (`dedup_covered_by_knowledge`). So a duplicate that reaches the judge is one the coverage gate did not catch.
- **Which proposals reach judgment.** The drain defers every pending proposal that no gate has decided, as `needs-judgment`, and leaves `proactive-needs-review` ones to a person without calling the judge. So the `reason` the drain sends is `needs-judgment` always; the judge's schema allows `proactive-needs-review`, which the drain never sends. The prompt prints it as "no quality judge has passed this content yet".
- **The input.** `{ proposal: { ref, source, content }, reason, liveAsset?, siblings, neighbours? }`. `liveAsset` is the file at the ref, absent for a new note (every promotion). `siblings` are the other pending proposals with the same ref (none). `neighbours` are, for a promotion only, the five knowledge notes nearest the source memory by stored vector, each `{ ref, description, excerpt }` with the excerpt cut at 300 characters. A proposal that is not a promotion gets `neighbours: []`. Notes promoted earlier in the same drain join the neighbours; the frozen input has none.
- **The prompt.** `buildJudgmentPrompt` prints the ref, the generator, the reason, the content in a fenced block, the live asset or "(none)", the siblings, the neighbours (with "Reject the promotion if these notes already cover what it says, even in other words"), and the task. A proposal from `consolidate` with no live asset is a promotion, and its reject rule adds "not durable": it reports the state of something that changes (a status, rollout, branch, commit, version, test count, "as of <date>"), is a plan not yet carried out, or describes something retired, replaced or superseded. "A lesson drawn from an incident is durable."
- **The route.** `accept` is accepted if the proposal is a promotion (`source: consolidate` with a `promotionSource`; any other kind that the judge accepts is left for a person, `judgment-not-promotion`): promoted in `applyMode: promote`, staged for the next promote run in queue mode. `reject` is rejected. `defer`, an unreadable reply (`judgment-parse-failure`) and a failed call (`judgment-error`) leave the proposal pending for a person. Every case here is a promotion.

## How the cases were made

The cases are what akm's own code builds, not text written for the eval (`src/capture.ts`):

1. **Memories.** akm's extract (`akm proposal extract`, the model under test as its engine) ran on the extract eval's sessions that hold something to keep, and each memory it queued was accepted into a bundle (`src/memories.ts`). The memories carry the frontmatter extract stamps.
2. **Bad sources.** The real extract run produces no status snapshot, no retired approach and no restated note, so for each good memory three notes were written by hand, in the style and length of the memories extract writes and with the source memory's frontmatter: a status report of work on its subject on a date (`ephemeral`), a note about an earlier approach on its subject that has since been retired (`stale`), and a knowledge note that says what the memory says in other words (the note a `duplicate` repeats, short enough that the judge's 300-character excerpt holds most of it). Those cases are marked `hand-written`, and the summary reports their bad accepted apart from the real and corpus ones (`bad_by_origin`). One real memory is bad: it describes a bug that the same session fixed (`assets/ADJUDICATION.md`).
3. **The promotion.** `capture.ts` puts a bundle in an akm sandbox on top of the 83 knowledge notes of the promotion eval, indexes it with akm's own embedder (bge-small-en-v1.5), and calls consolidate's `emitPromotionProposal` for every memory, with the coverage gate on, then `drainProposals` of the akm under test with the judge's `run` replaced by a recorder. What the recorder sees is the judge's input as the drain builds it: the live asset, the siblings and the five nearest notes included. Not modelled: consolidate's planner (a model that chooses which memories to promote; here each memory is a candidate and the description is the memory's own), and promotions accepted earlier in the same drain.
4. **Reachability.** `bun evals/drain-judge/src/reachable.ts --akm DIR` runs step 3 again with the akm checkout `DIR` and compares every case's input with what that akm builds (the `updated:` date akm stamps with the day of the run is left out). A case whose promotion akm no longer mints or sends to the judge is retired to `assets/retired.jsonl`, with the reason; `--rebuild` also writes the new input into a case that changed. `AKM_CHECKOUT=DIR bun test evals/drain-judge/src/reachable.test.ts` runs the same check as a test.

To make the set again (a model server for step 1; steps 3 and 4 need only the akm checkout):

```
bun evals/drain-judge/src/memories.ts --model ID --akm "bun ~/code/akm/src/cli.ts"   # 1. real memories, from extract
bun evals/drain-judge/src/sources.ts                                                   #    memories of other evals' corpora
                                                                                       # 2. the hand-written notes are in assets/bundle (sources.json says which)
bun evals/drain-judge/src/build.ts --akm ~/code/akm                                    # 3. inputs, labels, held-out part, retired cases
bun evals/drain-judge/src/reachable.ts --akm ~/code/akm                                # 4. check
```

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/drain-judge/run
evals/drain-judge/run --model qwen3-27b
evals/drain-judge/run --cases ~/notes/drain-judge        # a folder with a cases.jsonl in the format of assets/README.md
```

`--limit N` takes the cases in turn from good, ephemeral, duplicate and stale. `--config-patch` changes the akm config the eval writes. `--concurrency N` sets how many cases run at a time (default 1, all through one akm sandbox) and `--timeout-ms N` how many milliseconds akm gets for one (default 900000, 15 minutes). `--semantic` changes nothing the judge reads: the input is frozen. There is no rewrite (`--corpus custom` is `--cases DIR` only) and no `--strategy`: the judge runs on the default connection. It runs on a connection only: the isolation a harness run needs is built (`isolateHome` in `lib/akm/akm.ts`), but only judge-gate has the `--harness` flag so far.

The model must return one JSON object when asked: `{"decision": "accept" | "reject" | "defer", "reason": ...}`. A case is about 1.1k tokens in. The eval sets temperature 0 and `enableThinking: false`, which does not reach every gateway: on shredder's the model reasons unless the run passes `--config-patch FILE` with `{"engines":{"judge":{"reasoningEffort":"none"}}}`. With it, a 10-case smoke of qwen3.6-35b-a3b took about 57 completion tokens and under a second a call. The held-out part is `assets/heldout.jsonl`: copy it to `cases.jsonl` in a folder of its own and run `--cases` on that folder, to confirm a decision.

## How a case is scored

The case's `input` goes to `akm judge proposal.judgment` as it is, and akm's verdict becomes what the drain does with a promotion (`src/score.ts`):

| Outcome | What the drain does |
|---|---|
| `accept` | accepts the promotion: promoted (`applyMode: promote`) or staged for the next promote run (queue mode). Counted as accepted |
| `reject` | rejects it |
| `defer` | leaves it pending for a person, with the judge's reason |
| `unparseable` | the reply held no decision: leaves it pending (`judgment-parse-failure`). Counted, as a pending one |
| `error` | akm failed, timed out, or the call failed: leaves it pending (`judgment-error`). Left out of the counts, as in the other evals, because a dead endpoint says nothing about the judge |

`routeOf` of `lib/judge.ts` does not apply: this verdict has a `decision`, not `pass` and `reviewNeeded`. Every case is a consolidate promotion, the one kind the drain accepts on a judgment; any other kind that the judge accepts is left for a person (`judgment-not-promotion`), so it is not in the set.

**The defer rule.** A deferred promotion is not accepted, so a deferred bad promotion is not a bad accepted, and a deferred good one is not a good accepted. The defer rate is reported for each label, as the share of cases the judge deferred, and `left_pending` adds the unparseable replies. Nothing is counted as "caught" by a defer: a judge that defers everything is the `defer_all` baseline, with no harm and no recall.

| Metric | Meaning |
|---|---|
| `bad_accepted` | bad promotions accepted, out of the bad ones scored. The harm number: what the drain would write with no one looking. `by_category` splits it into `ephemeral`, `duplicate` and `stale`, and `bad_by_origin` into `real`, `corpus` and `hand-written`: most bad cases are hand-written, so read the corpus ones beside them |
| `good_accepted` | good promotions accepted, out of the good ones. Promotion's `recall` |
| `precision` | of everything accepted, the share that was good (`accepted_good` of `accepted`) |
| `good_rejected` | good promotions rejected outright: work lost |
| `defer_rate` | for `good` and `bad`, the share the judge deferred |
| `left_pending` | for `good` and `bad`, the share deferred or unparseable |
| `confusion` | each category (good, ephemeral, duplicate, stale) by outcome, errors included |
| `baselines` | `accept_all`, `reject_all` and `defer_all`: `good_accepted`, `bad_accepted` and `precision` of a judge that gives one answer. Accepting everything gives good 100%, bad 100% and precision equal to the share of good cases |
| `error_rate`, `unparseable_rate` | the shares of the cases run |
| `seconds` | `mean`, `median` and `max` of one call, over the cases that did not error. akm reports no cost: tokens are in `model_calls` of the summary (null where akm reports none), and cost is unknown |

One case is 2.2 points of `good_accepted` (1 of 45) and about 2 points of `bad_accepted` in a category (1 of 45 to 49), so a gap of a case or two is noise. A change is worth keeping when `good_accepted` rises and `bad_accepted` does not; reruns of the same model differ by a few cases.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts`, `status` and `aborted_reason`, `rubric_version`, the model, akm version and build, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `model_calls` (calls, mean tokens, seconds), `assets_sha256`, `corpus_folder` and the `manifest`. `samples.jsonl` has one row per case: the label and category, the origin and set, akm's verdict as printed (or its error), the outcome, the judge's reason and the seconds. The run stops, `aborted`, after 5 cases in a row that errored or got no decision.

## Notes

- Compare runs only within a rubric version and a measurement version (`MEASUREMENT_CHANGELOG.md`). A run needs an akm whose `proposal.judgment` is at schemaVersion 1; `lib/judge.ts` refuses another before the first case.
- The 54 held-out cases are not in a default run. Do not tune on them.
- 135 of the 139 scored bad cases are hand-written (see `assets/README.md`, "Known limits"); only 4 come from a corpus, and the one real bad memory is held out. Read `bad_accepted` with `bad_by_origin` beside it: it is what a judge lets through on notes written for the eval, not a rate on the drain's real backlog.
- Results go to `evals/drain-judge/results/`.

## Licence

MPL-2.0.
