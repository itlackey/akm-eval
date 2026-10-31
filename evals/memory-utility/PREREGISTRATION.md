# Pre-registration: memory-utility on LongMemEval cases

This file is committed before any held-out run. It fixes what a held-out run measures, how it is read, and what may change it.
`src/lme.test.ts` holds the constants below to the code, so the two cannot drift apart unseen. A change to any of them is a new
version of this file, committed before the run it applies to.

```json
{
  "case_source": "longmemeval",
  "dataset": "LongMemEval cleaned S release at the revision pinned in benchmarks/longmemeval/assets/ASSETS.lock",
  "split_salt": "akm-eval/memory-utility/longmemeval-split/v1",
  "split_rule": "per question type, the share of 100 dev questions by largest remainder (ties by the order of the types), then the questions with the smallest sha256(salt:question_id)",
  "halves_salt": "akm-eval/memory-utility/longmemeval-heldout-halves/v1",
  "halves_rule": "the 400 held-out questions are cut the same way into A (the first 200, by sha256(halves_salt:question_id) within each type, largest remainder) and B (the other 200)",
  "split_sizes": { "dev": 100, "heldout_a": 200, "heldout_b": 200 },
  "sample_seed": 42,
  "arm_order_seed": "1",
  "distractor_seed": "the first 32 bits of sha256(sample_seed:question_id)",
  "haystack": 16,
  "budgets": [4096, 8192],
  "primary_budget": 4096,
  "judge": { "model": "fast/qwen3.6-35b-a3b", "chat": { "max_tokens": 64 }, "temperature": 0, "recorded_as": "judge_model and eval_settings.judge_settings_sha256 in the summary" },
  "reader_and_inference": "the model under test, temperature 0, as --model names it",
  "primary_endpoint": "two paired comparisons over all selected cases, each tested with the exact McNemar test (two-sided): (a) inferred minus source at 4096, (b) inferred at 4096 minus source at 8192; Holm-adjusted over the two, alpha 0.05",
  "heldout_runs": "on the rewrite (--corpus custom), a whole half named by --split heldout-a or --split heldout-b: the first decision uses A, the next uses B, and a half is spent once akm is tuned on its failures"
}
```

## Budgets: the owner's decision

Only 4096 and 8192 estimated tokens, with 4096 the primary comparison. The first plan had five budgets from 256 to 4096 with the primary
at 1024. An aborted 30-case dev pilot (K=16, 35B, akm 0.10.261022) showed that 1024, 512 and 256 sit at the floor: a LongMemEval session
is about 10.5k characters at the median, so one raw session fills 4,096 characters whole. At 1024 the evidence turn was shown for 18 of
56 evidence sessions (35 of 56 at 4096), and `source` was right on 1 of 30 cases against `none` 1 of 30. The pilot was dev data only.

## What is measured

A case is one LongMemEval question with its evidence sessions and 16 seeded distractor sessions from the same history, each session kept
whole as one memory. Three arms answer it with the same reader: `none` (no memory), `source` (the original sessions, searched with the
question) and `inferred` (the library after one `akm improve` of native memory inference, searched the same way). The shown text of each
hit is packed at each budget with the evaluator's characters/4 packing, and the reader answers once per distinct packed text. The
benchmark's own judge prompts grade each answer yes or no; the judge never sees which arm answered. Labels are never sent to inference
or the reader.

## The primary question

Does native memory inference beat keeping the original notes, at a matched budget? There are two primary comparisons, each over every
selected case (an errored arm is a wrong answer) and reported with the exact McNemar p-value, the exact paired interval and the help and
harm counts: (a) `inferred - source` at 4096 estimated tokens, and (b) inferred at 4096 against source at 8192, the same cases (the
original notes given twice the room). They are Holm-adjusted together at alpha 0.05, and a summary records each p-value as it is and
after the adjustment (`metrics.primary_comparisons`). `source - none` at 4096 is a secondary, and so is `inferred - source` at 8192.

## The reading rule

- Inferred wins if either primary comparison, (a) or (b), is significant in inferred's favour after Holm at alpha 0.05: its adjusted
  p-value is below 0.05 and its difference is positive. Nothing else is a win, and no other pair of budgets is compared.
- A difference whose interval includes zero is no result, not a tie. Do not read a non-significant gain as support, or a non-significant
  loss as safety.
- `inferred - source` at 8192 is secondary and is not searched for the one where inference wins.
- Abstention questions are reported apart (`abstention`): inferred memory must not make the reader invent an answer there.
- The diagnostic says where the evidence went (shown, retrieval missed, packing cut, summary dropped). A loss attributed to the summary
  is an upper bound, since a faithful paraphrase has no verbatim turn.
- Known bias, reported and not corrected: the answer is usually in the first turn of a session, and a raw session keeps the prefix that
  fits, so raw notes do well at small budgets for a reason real notes may not share. The data is not reordered.

## Held-out discipline

- Dev (100 questions) is for pilots, debugging and estimating discordance; akm tuning may look at dev failures only.
- Held-out runs once per decision, on the rewrite, on a whole half of 200 questions. `--split heldout-a` and `--split heldout-b` are
  never a default, there is no bare `heldout`, and the runner refuses both on the public data.
- The runner holds a held-out run to this file. `--split heldout-a` and `--split heldout-b` refuse to start, before any akm or model
  setup, when the budgets (which fix the primary endpoint), the haystack, the sample seed, or the judge (its model, temperature and
  `chat.max_tokens`) differ from the values in the block above. The constants are the ones `src/lme.test.ts` holds this file to. Dev
  runs are free.
- The first decision uses half A and the next uses half B. Once an akm change is shaped by looking at the failures of a half, that half is
  spent; a later decision uses the other half, and when both are spent there is no held-out data left for this dataset and split.
- `--resume` re-asks errored cases and never wrong answers. A case in which any arm errored (a reader, judge, retrieval or inference
  failure) is asked again with all its arms, so the pairs hold, each time the run is resumed; a case that was answered, right or wrong,
  is kept as it was. Each sample of a case asked again carries `raw.retried: true`, so a retry is visible in the results.
- The data is public, so the discipline is procedural: this file, the committed split, and every held-out run recorded in the ledger.

## Pending at the time of writing

- No held-out run has been made.
- The judge is the lab 35B judging its own model's answers, blind to the arm (the owner's local `models.json` line `eval-judge-35b`,
  which a summary records by its model name, not by that line's name). A one-time agreement check of 50 dev answers against a
  stronger judge has not been done.
