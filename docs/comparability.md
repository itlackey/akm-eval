# Comparability rules

**Goal: every number this repo publishes must be directly comparable to the
same benchmark's published numbers from other tools (mem0, Zep, OpenViking,
a bare long-context baseline).**

**Constraint: nothing in the benchmark, its dataset, or its evaluator may be
modified in any way that could move a score.** A number produced by a modified
benchmark is not comparable to anyone else's, including our own earlier rounds.

These two sentences govern every decision below. Where a rule and convenience
conflict, the rule wins; where a rule and a deadline conflict, the honest move
is to publish less, not to publish something that cannot be checked.

## The two tiers — never mix them in one table

| tier | what it is | comparable to | lives in |
| --- | --- | --- | --- |
| **A — publishable** | a third-party benchmark, unmodified, scored by its own official evaluator | other tools' published numbers on that benchmark | this repo |
| **B — internal** | a first-party corpus we authored (akm's own task slices) | our own prior rounds, nothing else | [`akm-bench`](https://github.com/itlackey/akm-bench) |

A Tier-B number is not a weaker Tier-A number. It is a different kind of
claim: we wrote the tasks, so a favourable result is partly a statement about
our task authorship. **Never place a Tier-B figure in a table, chart, or
summary beside a Tier-A one**, and never let a reader infer that a
first-party corpus result validates akm against a competitor.

## Tier-A rules

A run is publishable only if every rule holds. Any violation makes it an
internal directional result — still useful, still worth recording, just not
publishable beside anyone else's number.

**A1. Official evaluator, unmodified.** Scores come from the benchmark's own
evaluator, invoked as the benchmark specifies. No local heuristic scorer, no
fuzzy fallback, no "close enough" string match. A pack that cannot reach its
official evaluator fails the run; it never degrades to an approximation.

**A2. Official dataset, unmodified.** The dataset file is the published one, at
a pinned revision. We do not edit items, repair answers, drop "bad" questions,
or normalize the corpus.

**A3. Full dataset, or a disclosed and defensible sample.** Prefer the whole
benchmark. If sampling is unavoidable, the sample MUST be:
- drawn with a **recorded seed**, uniformly at random over the eligible set —
  never the first N in file order, which is a systematic slice of whatever
  ordering the file happens to have;
- **category-representative**, or explicitly reported per category. Silently
  dropping a hard category inflates the score;
- reported as `n / N` next to every figure it produces, in every document.

A subset score is never presented as the benchmark's score. Write
"LongMemEval (n=25/500, seed=…)", not "LongMemEval".

**A4. The scoring method is part of the benchmark — judge AND metric.**

*The judge.* Where scoring uses an LLM judge, the judge model and its prompt
are part of the published definition. Swapping in a cheaper judge changes
absolute scores and breaks comparison to every published figure. Either run
the benchmark's specified judge, or label the result judge-substituted and do
not compare it across tools.

- **LongMemEval specifies `gpt-4o`.** The bundled
  `scripts/longmemeval-evaluator.py` reproduces upstream's per-question-type
  rubrics verbatim (abstention, the temporal off-by-one tolerance,
  knowledge-update, preference), so the judge model is the only non-compliant
  part.

  **CURRENT STATE — judge-substituted by operator decision, until further
  notice.** The committed config judges with ai.lab `auto`
  (`https://ai.lab.fwdslsh.dev/v1`). LongMemEval absolutes produced this way
  are internal figures: they may NOT be placed beside another tool's published
  LongMemEval score.

  `auto` is additionally a **routing alias, not a pinned model**, which is a
  strictly weaker position than substituting a fixed judge — an unpinned judge
  can differ between runs, so two of our OWN runs are not necessarily
  comparable either. The evaluator therefore records the server-reported
  `resolved_model` on every prediction and prints a census to stderr, with a
  warning when more than one model served a single run. Read that census
  before comparing any two rounds. Restoring publishability means setting
  `evaluatorModel` back to `gpt-4o` and re-running; nothing else about the
  pack has to change.
- **LoCoMo: no judge.** `scripts/locomo-evaluator.py` computes deterministic
  token-F1 per `snap-research/locomo`'s own rules. Nothing to substitute — and
  this is why LoCoMo's cross-round numbers stayed stable while LongMemEval's
  moved.

*The metric.* Matching the dataset and the judge is still not enough if the
**reported quantity** differs. The same benchmark is often published under
different metrics — LoCoMo in particular is reported by some tools as
LLM-judge accuracy rather than the token-F1 this repo computes. Those are
different numbers over the same questions, and placing them in one column is a
category error no amount of care elsewhere repairs.

> **Before citing any competitor figure, confirm which metric they reported,
> from their own published methodology.** If it differs from ours, either match
> theirs or do not make the comparison. "Same benchmark" is not the bar; "same
> quantity" is.

*Routing.* The judge and the agent may need different endpoints — the
benchmark names the judge model, and the endpoint an agent arm runs on need
not serve it (opencode Zen serves no gpt-4 family at all). Set
`AKM_EVAL_JUDGE_API_KEY` / `AKM_EVAL_JUDGE_BASE_URL` to point the judge
independently; without them the judge follows the agent's provider.

**A5. One variable per round.** Between two rounds being compared, exactly one
thing changes. When more than one moves (sample size and agent model; CLI and
plugin and runtime), no delta attributes to any of them — say so in the report
rather than implying attribution.

**A6. Arms differ only in the thing under test.** Same agent model, same
prompt construction, same token budget, same retry policy across arms. Where an
asymmetry is unavoidable and by design (a full-context baseline reads the whole
haystack; a retrieval arm reads only retrieved text), it is documented at the
config and repeated in the report.

**A7. Every published figure carries its provenance.** Backend id and version,
agent model, judge model, dataset revision, `n / N`, sample seed, and the run
artifact it came from. A figure whose artifact cannot be located is retracted,
not defended.

**A8. This repo does not host competitor arms.** mem0, Zep and OpenViking were
removed rather than implemented. A competitor arm we configure ourselves is a
strawman risk: if we under-configure it — wrong topK, unsupported ingestion
path, defaults they would never publish against — the resulting win is not a
finding, and it is the first thing a sceptical reader will check.

Cross-tool comparison takes one of two forms instead:

1. **Cite their published figure**, which is only valid when our own run on
   that benchmark is Tier-A compliant — same dataset revision, full or
   seeded-random sample, the benchmark's own judge, its official evaluator.
   Citing a competitor's full-dataset official-judge number beside our 5%
   substituted-judge subset is not a comparison, it is a category error.
2. **Run the vendor's own published tool** as they document it, and publish
   both runs' provenance side by side. Stronger, and the right form once our
   own numbers are trusted.

If a competitor arm is ever re-added here, it inherits the obligation this
rule was written for: configure it to the standard of its own published
methodology, record its version and config in the artifact, and prefer their
settings over our guesses.

**A9. Report what looks bad.** Where akm loses, the losing number is published
with the same prominence as a winning one. This rule exists because the value
of the whole exercise is that a reader can trust the numbers that favour us.

## Known Tier-A violations, currently open

These block publication today. Each is tracked with what it would take to clear.

1. ~~Sampling is first-N~~ — **FIXED.** `src/core/sampling.ts` draws a seeded
   uniform sample; subsetting a non-smoke run without an integer `sampleSeed`
   now fails loudly rather than silently taking file order. Provenance
   (`order`, `seed`, `n`, `total`) is recorded for the artifact.

   How bad it was, measured: the first 25 LongMemEval questions are **100%
   `single-session`** — a single category. A seeded n=25 spans all five
   (4 single-session / 10 multi-session / 1 preference / 8 temporal /
   2 knowledge-update). Every committed n=25 LongMemEval figure is a
   one-category score.
2. **The committed rounds remain unpublishable** — LongMemEval n=25 of 500
   (5%), LoCoMo 1 of 10 conversations and 25 of 1,986 QA pairs (~1.3%), both
   drawn under the old first-N behaviour. The fix makes future runs
   compliant; it does not retroactively repair these. Re-run before citing.
3. ~~Category mislabelling~~ — **FIXED.** `normalizeCategory()` tested
   `single` before `preference` (making `preference` unreachable) and ended in
   a catch-all `return "single-session"` that absorbed all 78
   `knowledge-update` questions. It now checks most-specific first and throws
   on an unrecognised type. Verified against the full dataset: 126 / 133 / 30
   / 133 / 78 across the five categories, summing to 500. The committed
   configs' `questionCategories: ["single-session", "multi-session"]` still
   excludes `temporal`, `preference` and `knowledge-update` by choice — that
   is now a visible, correctly-labelled choice rather than a silent one.
4. **The judge was `qwen3.5-plus`, not LongMemEval's specified judge.**
   Violates A4; all committed LongMemEval absolutes are judge-substituted.
5. ~~mem0/Zep/OpenViking placeholders~~ — **closed by removal.** No
   head-to-head exists, and the path to one now runs through A8's two forms
   rather than through a backend in this repo. Violations 1-4 are what
   actually gate it: a citation comparison is only valid once our own side of
   it is Tier-A compliant.

See `docs/operator-blockers.md` for the operator-side prerequisites.
