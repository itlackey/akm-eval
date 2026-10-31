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
  "split_sizes": { "dev": 100, "heldout": 400 },
  "sample_seed": 42,
  "arm_order_seed": "1",
  "distractor_seed": "the first 32 bits of sha256(sample_seed:question_id)",
  "haystack": 16,
  "budgets": [4096, 8192],
  "primary_budget": 4096,
  "judge": "eval-judge-35b",
  "reader_and_inference": "the model under test, temperature 0, as --model names it",
  "primary_endpoint": "inferred minus source accuracy at the primary budget, over all selected cases, tested with the exact McNemar test (two-sided, alpha 0.05)",
  "heldout_runs": "on the rewrite (--corpus custom), 200 questions drawn with --limit 200 under the sample seed; the next decision draws 200 from the questions not yet drawn"
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

Does native memory inference beat keeping the original notes, at a matched budget? The primary comparison is `inferred - source` at 4096
estimated tokens, over every selected case (an errored arm is a wrong answer), reported with the exact McNemar p-value and the exact
paired interval. `source - none` at 4096 is a secondary, and so is 8192.

## The reading rule

- Inferred wins only if it is better than source at a matched budget (a primary result with p < 0.05 and a positive difference, ideally
  also positive at 8192), or if inferred at 4096 reaches the original notes' accuracy at 8192, the larger budget.
- A difference whose interval includes zero is no result, not a tie. Do not read a non-significant gain as support, or a non-significant
  loss as safety.
- 8192 is secondary and is not searched for the one where inference wins.
- Abstention questions are reported apart (`abstention`): inferred memory must not make the reader invent an answer there.
- The diagnostic says where the evidence went (shown, retrieval missed, packing cut, summary dropped). A loss attributed to the summary
  is an upper bound, since a faithful paraphrase has no verbatim turn.
- Known bias, reported and not corrected: the answer is usually in the first turn of a session, and a raw session keeps the prefix that
  fits, so raw notes do well at small budgets for a reason real notes may not share. The data is not reordered.

## Held-out discipline

- Dev (100 questions) is for pilots, debugging and estimating discordance; akm tuning may look at dev failures only.
- Held-out runs once per decision, on the rewrite. `--split heldout` is never a default and the runner refuses it on the public data.
- Once an akm change is shaped by looking at held-out failures, those cases are spent, and the next decision draws from the held-out
  cases not yet drawn.
- The data is public, so the discipline is procedural: this file, the committed split, and every held-out run recorded in the ledger.

## Pending at the time of writing

- No held-out run has been made.
- The judge is the 35B judging its own model's answers, blind to the arm. A one-time agreement check of 50 dev answers against a
  stronger judge has not been done.
