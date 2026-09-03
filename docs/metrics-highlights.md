# akm metrics highlights

**What akm measurably does for an agent, and where it does not.**

Measured 2026-09-03 against `akm-cli` 0.9.10. Every number here comes from a
committed run artifact and is cited to it, so any claim can be re-derived.
Where a result did not survive scrutiny, it is stated rather than dropped.

**Read the tier labels.** Section 1-3 are **Tier A**: LongMemEval, run
unmodified through its own official evaluator with the judge the benchmark
specifies. They may be compared to other tools' published LongMemEval figures,
subject to the caveats in each. Section 4 is **Tier B**: a corpus *we wrote*,
which supports claims about akm across versions and nothing else. The two are
kept apart deliberately — see `docs/comparability.md`.

---

## The one-line summary

akm answers as well as reading an entire conversation history, on **11% of the
tokens**, and roughly **doubles** naive vector retrieval. Its weakness is not
retrieval quality — retrieval is nearly solved at 81% recall — it is reasoning
over what was retrieved, and corpora small enough not to need retrieval at all.

---

## 1. Token efficiency — the strongest result (Tier A)

LongMemEval, n=200/500 seeded (`sampleSeed: 1337`), all five categories, judge
`gpt-4o`, agent `deepseek-v4-flash`:

| arm | accuracy | 95% CI | total tokens | vs baseline |
| --- | --- | --- | --- | --- |
| baseline (full context) | 0.660 | [0.592, 0.722] | 20,916,299 | 1.00x |
| **akm-memory** | **0.590** | [0.521, 0.656] | **2,389,829** | **0.114x** |
| raw-vector | 0.285 | [0.227, 0.351] | 2,217,340 | 0.106x |

**akm is statistically indistinguishable from reading the entire corpus**
(Δ = −0.070, z = 1.45, p = 0.148 — no basis to call these different) **while
reading about a ninth of the tokens.**

For an agent that would otherwise stuff a whole history into context, that is
often the difference between a task fitting in the window and not.

Source: `runs/RESULTS-n200-0.9.10.md`.

## 2. Retrieval quality — akm vs the alternative (Tier A)

Same corpus, same agent, same 200 questions, against a naive in-memory cosine
store:

| metric | akm-memory | raw-vector |
| --- | --- | --- |
| accuracy | **0.590** | 0.285 |
| recall@5 | **0.812** | 0.377 |
| precision@5 | **0.467** | 0.138 |
| mrr | **0.774** | 0.341 |

**+0.305 accuracy, z = 6.15, p < 0.0001** — decisive, and the retrieval metrics
show the mechanism rather than leaving it inferred.

## 3. Where akm does NOT help — stated plainly (Tier A)

**Retrieval is no longer the bottleneck; reasoning over it is.** akm retrieves
the right evidence for **81%** of questions and answers **59%** of them. That
gap is the honest headroom, and it is not a retrieval problem.

**Two categories are not retrieval failures at all.** On `temporal` (0.38) and
`preference` (0.33), akm *exactly equals* the full-context baseline — both arms
fail them at the same rate, so nothing about memory is causing those losses.
The real gap to baseline is concentrated in `knowledge-update` (0.73 vs 0.91)
and `multi-session` (0.55 vs 0.68).

| category | baseline | akm | raw-vector |
| --- | --- | --- | --- |
| single-session | 0.89 | 0.86 | 0.52 |
| knowledge-update | 0.91 | 0.73 | 0.52 |
| multi-session | 0.68 | 0.55 | 0.18 |
| temporal | 0.38 | 0.38 | 0.13 |
| preference | 0.33 | 0.33 | 0.00 |

**Retrieval buys nothing when the corpus already fits the window.** An earlier
LoCoMo round, whose conversation fits a 16,000-token budget, had akm losing to
full context — retrieval solving a problem the baseline does not have. That
round predates the current sampling and judge rules and is not restated here as
a figure; the qualitative point stands.

## 4. Coding tasks — real, and entirely conditional on being called (Tier B)

**This is a first-party corpus. These numbers are not comparable to any
third-party benchmark and must never appear beside one.**

Harbor A/B, 28-task train slice, 168 trials, `akm-cli` 0.9.10:

| metric | value |
| --- | --- |
| control pass@1 | 66.7% [0.488, 0.833] |
| treatment pass@1 | 86.9% [0.750, 0.964] |
| paired delta | +0.202 [0.060, 0.369] |

**The mechanism, which is the actionable part:**

| trials where akm was… | effect |
| --- | --- |
| **called** | **+0.857** [0.571, 1.000] |
| not called | +0.015 [−0.076, 0.106] |

**Context injection alone is worth approximately zero.** akm helps when the
agent invokes it and does essentially nothing when it does not.

**And engagement is a property of the task, not the prompt.** Splitting the
same run by whether a task has a genuine knowledge gap:

| tasks | control | akm | delta | engagement |
| --- | --- | --- | --- | --- |
| gap-bearing | 0.000 | 0.889 | +0.889 | **89%** |
| already-known | 0.848 | 0.864 | +0.015 | **5%** |

The model calls akm ~89% of the time where akm is the only possible source of
the answer, and ~5% where it already knows. That is correct behaviour. Three
rounds of a flat 21-25% aggregate engagement rate were measuring **what
fraction of the corpus has a knowledge gap** — 19 of 84 trials — not the model
and not the plugin. A guidance rewrite aimed at that number could not have
moved it.

Sources: `akm-bench/results/harbor/2026-09-03/`,
`akm-bench/results/calibration/`.

## What an agent should conclude

1. **Call akm.** The entire measured benefit is conditional on invocation.
2. **Prefer akm over stuffing a large corpus into context** — same answer
   quality at ~11% of the tokens.
3. **Don't bother when the whole corpus already fits**, or when the answer is
   something the model plainly knows.

## Methodology

- **Sampling.** n=200 of 500, drawn uniformly at a recorded seed and spanning
  all five categories. Earlier rounds took the first 25 in file order, which
  landed **100% in one category** — the easiest one. Those figures (baseline
  0.920 / akm 0.880) are retracted; this round supersedes them. The direction
  of the finding survived, the magnitude did not.
- **Judge.** `gpt-4o`, the model LongMemEval specifies, served by
  `gpt-4o-2024-08-06` on all 600 calls with zero undecidable verdicts.
- **Controls.** `raw-vector`, a naive cosine store, ran in every round; it is
  what licenses attributing akm's results to akm rather than harness drift.
- **Provenance.** Every artifact records backend id and version, judge model,
  sample seed, and n/N.

## Caveats a reader should carry

- **n=200/500 (40%).** Seeded and category-spread, so an unbiased estimate —
  but a sample. A published full-dataset figure is not exactly this.
- **The agent model is our choice** (`deepseek-v4-flash`). Another tool's
  published number uses theirs.
- **No competitor has been run.** There is no akm-vs-mem0 measurement here, and
  nothing in this document is one. See `docs/comparability.md` A8.
