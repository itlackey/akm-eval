# akm metrics highlights

**What akm measurably does for an agent, and where it does not.**

> **NOT YET PUBLISHABLE — see [`docs/comparability.md`](./comparability.md).**
> This document predates the comparability rules and violates several of them.
> Read it as an internal directional summary, not as figures that can stand
> beside another tool's published benchmark numbers:
>
> - **§1 and §2 are LongMemEval at n=25 of 500 (5%) and LoCoMo at 1 of 10
>   conversations / 25 of 1,986 QA pairs (~1.3%)**, sampled as the first N in
>   file order rather than a seeded random draw (A3).
> - **The LongMemEval judge was `qwen3.5-plus`, not the benchmark's specified
>   judge** — every LongMemEval absolute here is judge-substituted (A4).
> - **The LongMemEval sample excludes the `temporal` category entirely**, and
>   `knowledge-update` is mislabelled into `single-session` by a catch-all in
>   `normalizeCategory()` (A2/A3).
> - **§4 is a Tier-B first-party corpus result** from `akm-bench` sitting in
>   the same document as Tier-A benchmark numbers, which B1 forbids. Its
>   engagement figure is now known to track corpus composition rather than
>   model behaviour — see `akm-bench/docs/comparability.md`.
> - **No competitor (mem0, Zep) has ever been run**, so nothing here is a
>   head-to-head with anything but our own naive-vector control.
>
> The retrieval-probe numbers in §3 are unaffected: they are deterministic,
> LLM-free, and internal by construction.

Measured 2026-08-26 → 2026-08-30 against `akm-cli` 0.9.1 → 0.9.3. Every number
here comes from a committed run artifact; sources are cited per section so any
claim can be re-derived. Where a result did not survive scrutiny, it is stated
rather than dropped.

---

## The one-line summary

akm's value is **conditional on being called**, and where it is called it is
substantial: it matches a full-context reference at **6.5% of the tokens** and
roughly **doubles** naive vector retrieval. Its weakness is not retrieval
quality — it is engagement, and corpora small enough not to need retrieval.

---

## 1. Token efficiency — the strongest result

LongMemEval, n=25, `akm-cli` 0.9.3, agent `deepseek-v4-flash`:

| arm | accuracy | total tokens | vs baseline |
| --- | --- | --- | --- |
| baseline (full context) | 0.920 | 2,607,654 | 1.00x |
| **akm-memory** | **0.880** | **169,295** | **0.065x** |
| raw-vector | 0.520 | — | — |

**akm is statistically indistinguishable from reading the entire corpus**
(z ≈ 0.47, p ≈ 0.64 — no basis to call 0.880 and 0.920 different) **while
reading 1/15th of the tokens.**

This is the clearest agent-facing benefit in the data. An agent that would
otherwise stuff a whole history into context gets the same answer quality for
6.5% of the context budget — often the difference between a task fitting in a
window and not.

Source: `runs/RESULTS-n25-0.9.3.md`; `telemetry.totalTokens` per arm.

---

## 2. Retrieval quality — akm vs the alternative

akm against a naive in-memory cosine store; same corpora, agent, and n:

| pack | akm-memory | raw-vector | ratio | significance |
| --- | --- | --- | --- | --- |
| LongMemEval (n=25) | **0.880** | 0.520 | 1.7x | **p ≈ 0.003** (decisive) |
| LoCoMo (n=25) | **0.431** | 0.213 | 2.0x | p ≈ 0.03 (borderline) |

Replicated on both packs. Honest caveat: **the LoCoMo gap is only borderline
significant at n=25** — the direction is consistent, but that sample cannot
carry a strong claim. The LongMemEval gap can.

Source: `runs/RESULTS-n25-0.9.3.md` (Wilson CIs, two-sample z-tests).

---

## 3. Retrieval coverage — what 0.9.2 fixed

Through 0.9.1, akm indexed only synthesized frontmatter and never body prose,
so conversational corpora were unsearchable by construction (akm#819).
Measured with deterministic probes, **no LLM in the loop** — same corpora, same
code path, only the CLI version differing:

| pack | metric | 0.9.1 | 0.9.3 |
| --- | --- | --- | --- |
| LoCoMo (40q) | zero-hit rate | 75.0% | **0.0%** |
| | evidence recall@5 | 0.154 | **0.590** |
| LongMemEval (20q) | zero-hit rate | 100% | **0.0%** |
| | evidence recall@5 | 0.000 | **0.950** |

Zero-hit alone would not prove this — a retriever returning five arbitrary
documents also scores 0% zero-hit. Evidence recall is the discriminator: at
topK=5 over a 419-document haystack, chance recall is ~1%.

Source: `scripts/probes/retrieval-probe.ts` — reproducible in minutes, free.

---

## 4. Coding tasks — the effect is real, but gated on engagement

Harbor A/B, 28-task train slice, 84 trials per arm, `AKM_WRITE_GATE=observe`:

| metric | value |
| --- | --- |
| control pass@1 | 69.0% [0.524, 0.845] |
| **treatment pass@1** | **85.7% [0.726, 0.964]** |
| paired delta | **+0.167 [0.036, 0.321]** |
| akm engagement rate | 21.4% (18/84) |

**The mechanism — the most actionable finding here:**

| trials where akm was… | effect |
| --- | --- |
| **called** | **+0.778** [0.444, 1.000] |
| not called | **0.000** [−0.061, 0.061] |

**Context injection alone is worth approximately zero.** akm helps when the
agent invokes it and does essentially nothing when it does not. Every point of
aggregate improvement is bought by engagement.

Caveat: the engagement-conditioned buckets hold 6–8 tasks, so magnitudes are
loose. The *sign* has replicated across three independent rounds; the exact
numbers should not be quoted precisely.

Source: `akm-bench/results/harbor/2026-08-29/train-observe-retrain-093.md`.

---

## Where akm does NOT help — stated plainly

**1. It loses to full context when the corpus fits in the window.**
LoCoMo, n=25: akm 0.431 vs baseline 0.649 (z ≈ 2.27, p ≈ 0.023 — a real gap,
not noise). LoCoMo's conversation fits a 16,000-token budget, so retrieval is
solving a problem the baseline does not have. **Hypothesis, untested:**
retrieval earns its keep only once the corpus exceeds the context window —
which is what LongMemEval's larger haystacks approximate.

**2. Engagement is low, and did not improve when we tried to fix it.**
akm-plugins#97 rewrote the guidance trigger specifically to raise engagement on
edit-shaped tasks. Measured after: **21.4%, down from 25.0%** — flat-to-slightly
worse, within noise on 84 trials, but certainly not the improvement the change
was made to produce. The trigger-wording hypothesis is **unconfirmed**.

**3. Retrieved context is mostly noise.**
LoCoMo `precisionAtK` = **0.233** against `recall@5` = 0.590 — akm finds the
answer 59% of the time, but ~77% of what it returns is irrelevant. Recall alone
called this healthy; precision is what exposed it. Unimproved headroom.

---

## What an agent should conclude

1. **Call akm.** The entire measured benefit is conditional on invocation
   (+0.778 called vs 0.000 not called). An agent that reads injected context but
   never invokes the tools captures none of the value.
2. **Prefer akm over stuffing a large corpus into context.** Same answer
   quality at 6.5% of the tokens where the corpus is large.
3. **Do not bother when the whole corpus already fits.** Retrieval measurably
   underperforms full context there.

---

## Methodology notes

- **Controls.** `raw-vector`, a naive cosine store, ran in every round. On
  LoCoMo it held at 0.233 → 0.213 across five rounds, which is what licenses
  attributing akm's changes to akm rather than harness drift.
- **Cross-round comparability.** The n=25 round changed the agent model
  (`qwen3.5-plus` → `deepseek-v4-flash`) alongside n, so no cross-round figure
  is a clean n-only comparison. The judge was pinned at `qwen3.5-plus`
  deliberately, so judged scores stay attributable. LongMemEval's control moved
  0.20 → 0.52 across that change (it scores via an LLM judge); LoCoMo's held (it
  scores via a deterministic F1 evaluator). **LongMemEval absolute numbers are
  within-round only.**
- **Sample sizes.** Retrieval probes: 40 and 20 questions. Judged runs: 25 per
  pack, raised from 5 — at n=5 a single question moved a score by 0.20, which is
  why the earlier LoCoMo result (0.633) did not survive.
- **Provenance.** From this round on every artifact records `backendId` and
  `backendVersion`, so a result states which binary produced it.

## Sources

| document | contents |
| --- | --- |
| `runs/RESULTS-n25-0.9.3.md` | n=25 judged + probes, CIs, significance |
| `runs/RESULTS-0.9.2.md` | the n=5 round it supersedes |
| `akm-bench/results/harbor/2026-08-29/train-observe-retrain-093.md` | coding A/B on the current stack |
| `akm/docs/plans/benchmark-tuning-findings.md` | how the engagement mechanism was established |
| `scripts/probes/retrieval-probe.ts` | the free, deterministic probes |
