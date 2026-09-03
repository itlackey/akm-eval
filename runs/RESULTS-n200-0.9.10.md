# LongMemEval, n=200/500 seed=1337 — akm-cli 0.9.10

Date: 2026-09-03 · Run: `runs/longmemeval-full-2026-09-03T16-38-52Z/`

**The first Tier-A compliant round in this repo.** Every earlier LongMemEval
figure here was drawn as the first N in file order, which landed 100% in one
category, and judged by a substituted model. Both are fixed; see
`docs/comparability.md`.

| property | value |
| --- | --- |
| sample | 200 of 500, seeded uniform (`sampleSeed: 1337`) |
| categories | all five, unfiltered |
| judge | `gpt-4o` — the model LongMemEval specifies |
| judge actually served by | `gpt-4o-2024-08-06`, **all 600 calls**, no variation |
| undecidable verdicts | 0 |
| agent (all arms) | `deepseek-v4-flash` via opencode Zen |
| akm-cli | 0.9.10 |
| evaluator | official rubrics, unmodified |

## Results

| arm | accuracy | 95% Wilson CI | total tokens | vs baseline |
| --- | --- | --- | --- | --- |
| baseline (full context) | **0.660** | [0.592, 0.722] | 20,916,299 | 1.00x |
| **akm-memory** | **0.590** | [0.521, 0.656] | **2,389,829** | **0.114x** |
| raw-vector | 0.285 | [0.227, 0.351] | 2,217,340 | 0.106x |

Two-sample z-tests on the differences that matter (n=200 per arm):

| comparison | Δ | z | p | verdict |
| --- | --- | --- | --- | --- |
| akm-memory vs raw-vector | **+0.305** | 6.15 | <0.0001 | **decisive** |
| akm-memory vs baseline | −0.070 | 1.45 | 0.148 | **no basis to call these different** |

### Retrieval quality (same 200 questions, no LLM)

| arm | precision@5 | recall@5 | mrr | ndcg@5 |
| --- | --- | --- | --- | --- |
| akm-memory | **0.467** | **0.812** | **0.774** | **0.784** |
| raw-vector | 0.138 | 0.377 | 0.341 | 0.308 |

### Per-category accuracy

| category | baseline | akm-memory | raw-vector |
| --- | --- | --- | --- |
| single-session | 0.89 | 0.86 | 0.52 |
| knowledge-update | 0.91 | 0.73 | 0.52 |
| multi-session | 0.68 | 0.55 | 0.18 |
| temporal | 0.38 | 0.38 | 0.13 |
| preference | 0.33 | 0.33 | 0.00 |

## What this round establishes

**1. akm matches a full-context reference at 11% of the tokens.** 0.590 vs
0.660 is not a distinguishable difference at n=200 (p=0.148), while reading
2.4M tokens against 20.9M. This is the claim worth publishing, and unlike the
n=25 version of it, the sample it rests on is random and spans every category.

**2. akm roughly doubles naive vector retrieval, decisively.** +0.305 at
p<0.0001 — far stronger evidence than the earlier rounds could support, and
the retrieval metrics show the mechanism: recall@5 0.812 vs 0.377.

**3. Retrieval is not the remaining bottleneck; reasoning over it is.** akm
retrieves the evidence for 81% of questions but answers 59% of them. On
`temporal` and `preference` akm exactly equals the full-context baseline
(0.38 and 0.33) — both arms fail them at the same rate, so those losses are
not retrieval failures at all. The gap to baseline is concentrated in
`knowledge-update` (0.73 vs 0.91) and `multi-session` (0.55 vs 0.68).

## What changed from the n=25 rounds, and why those numbers were wrong

The previous round reported LongMemEval baseline 0.920 and akm 0.880. Both
were 25 questions taken as `slice(0, 25)`, which is **100% `single-session`** —
the easiest category, where baseline still scores 0.89 here. The apparent
0.92 was not the benchmark's difficulty; it was one category's.

Judge substitution compounded it: those rounds judged with `qwen3.5-plus`
rather than the specified `gpt-4o`.

The direction of the headline finding survived both corrections. Its magnitude
did not: akm is 0.590 on a representative sample, not 0.880.

## Caveats

- **n=200/500 (40%).** Every figure here carries that. Seeded and
  category-spread, so it is an unbiased estimate — but it is a sample, and a
  published full-dataset figure from another tool is not exactly this.
- **Agent model is ours** (`deepseek-v4-flash`), a disclosed choice. Another
  tool's published number uses theirs; absolute comparison across tools carries
  that difference.
- **`preference` n is small** (30 of 500 in the full set), so its per-category
  cell is noisy in all three arms.
- **LoCoMo is not in this round.** It scores by token-F1, not an LLM judge;
  before citing any competitor's LoCoMo figure, confirm which metric they
  reported (`docs/comparability.md` A4).
