# Bakeoff 0.3: scoring memory inference's explicit no-change decision

Collected October 21, 2026 UTC for [akm-eval#132](https://github.com/itlackey/akm-eval/issues/132). This is a
measurement change, not a model result: it shows what the old and the new harness say about the same akm outputs,
and **no model-quality gain is claimed**. [`pilot.json`](pilot.json) holds every case row of the four runs.

## What was measured

| | Baseline harness | Candidate harness |
|---|---|---|
| akm-eval | `main` at `94c3de1`; bakeoff collector and scorer 0.2 | this change; bakeoff collector and scorer 0.3 |
| Cases | the same 19 memory-inference notes, as a custom corpus; the 5 no-change cases carry placeholder `required` terms, since 0.2 cannot express no-change | the 19 public memory-inference cases (`--process memory-inference`) |
| akm | `release/0.10.0` at `ef6ea7ab3` (akm#1218), run from source with `AKM_BIN`; reports 0.10.261009, build `v0.9.0-beta.60-2852-gef6ea7ab3`. `akm-cli@0.10.261010-beta` was not yet published | the same build |
| Model | `splinter-b70/qwen3.8-flash-next-iq2_xs`, served as `qwen3.8-flash-next-iq2_xs` (the same in every response) | the same |
| Settings | temperature 0, thinking off, keyword search, concurrency 1, 900 s per akm command, endpoint `<MODEL_BASE_URL>` | the same |

The four runs ran one at a time on the one model server, alternating baseline and candidate, two runs each. The
skill used was `akm-measured-improvement` from `akm-stash` main at `ff35ed5`. Public cases only; no private asset and no cloud API.

## Result

| | Baseline 0.2 (r1, r2) | Candidate 0.3 (r1, r2) |
|---|---|---|
| Cases passed | 14/19 in both | 16/19 in both |
| Notes that need no child (5): correct restraint | not expressible: 3 reported `unusable`, scored by placeholder terms | 3/5 (`tool-tally`, `checkpoint-progress`, `context-resume`) |
| Notes that need no child: unjustified child | not detected (placeholders pass) | 2/5 (`short-log-directory`, `short-format-command`) |
| Notes that need a child (14): false abstention | 1, reported `unusable` | 1 (`reference-not-executed`: its five-step runbook lookup) |
| Grounding failures (forbidden claims in the 13 children that need to be grounded) | 1, a false positive: "is not enabled for the EU region" counted as the forbidden claim | 0 |
| Errors / timeouts / failed model calls | 0 / 0 / 0 | 0 / 0 / 0 |
| akm outcomes | output 15, unusable 4 | output 15, no-change 4 |
| `valid_output` | 15/19 | 15/19: a no-change is a decision and no document, so it stays in the denominator and out of the numerator |
| Model calls recorded by akm | 38 per run (19 memory-inference calls plus 19 one-word preflight probes that akm sends first; counted with a scripted endpoint), mean 301 prompt and 56 completion tokens, 1.36 s per call | identical |
| Median case time, wall time | 3.3 to 3.4 s, 61.1 to 61.6 s | 3.3 s, 61.0 to 61.2 s |

Variation: none. Both runs of each arm have the same outcome and the same checks on every case, and the two arms
agree on every case's akm outcome apart from how it is labelled (a no-change is `unusable` to 0.2). Temperature 0 on a
single quantised model is not proof that other runs would agree; two observations per arm is the initial diagnostic only.

What this shows about the harness:

- The 0.2 harness reports every no-change as `unusable`, so a correct restraint is a failed case and cannot be told from a
  malformed reply. 0.3 reads akm's own `memoryInference.noChange` count: three of those four are correct restraint and one is a false abstention.
- The two short notes (`Application logs are written to /var/log/app/.`, `Run bun run fmt before pushing.`) still get a child.
  That matches akm's own #1208 pilot (a conservative prompt: "when in doubt, do not use noChange"). It is the finding the
  new cases are for, not a regression, and these cases are not a general restraint rate.
- 0.2 fails the valid negation in `infer-negated-region`; 0.3 accepts it, and rejects the same claim asserted without the negation (score tests).

## Checks

- `scripts/check typecheck test`: 2952 pass, 29 skip, 0 fail.
- `evals/bakeoff/src/real.test.ts` against akm `ef6ea7ab3` (`AKM_EVAL_REAL_AKM=1`): 8 pass. It scripts the model and distinguishes a valid
  no-change, a valid child, a malformed reply (`unusable`, never a no-change), a switched-off pass, an unavailable endpoint, a timeout,
  and a memory akm did not consider (an error: nothing counted, nothing written), and an always-abstain model passes only the notes that need no child.
- Score and rescore tests reject an always-abstain treatment, an unjustified child, and unsafe request-to-completion, lookup-to-execution and
  historical-to-current summaries that keep every required term and the date. An old row with no derived memory and no counters
  is refused by `scripts/rescore` with a recollect requirement; it is never guessed to be a no-change.

## Not covered, and what waits

- Scope cases wait for [akm#1209](https://github.com/itlackey/akm/issues/1209) and historical-date cases whose date lives only in metadata for
  [akm#1210](https://github.com/itlackey/akm/issues/1210): their correct answer needs source context akm does not send yet. The date cases here keep
  their dates in the note body, and the metadata dates are checked as forbidden inventions as before.
- Session-summary's `summary omits` check does not tolerate negation; only memory inference's does.
- The installed-path check on `akm-cli@0.10.261010-beta` is open until that beta is published.
- Saved 0.2 runs keep their scores; those with unusable memory-inference rows must be collected again to be scored by 0.3, and 0.2 and 0.3
  totals are not comparable (the corpus gained 11 cases).
