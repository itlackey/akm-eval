# Retrieval probe — 0.9.13 vs 0.9.10–0.9.12 (2026-09-04)

LLM-free Tier-1 retrieval probe (`bin/probe`), published npm builds, MAX_Q=40
(locomo, whole conv-26 slice) and MAX_Q=20 (longmemeval).

## Headline

**0.9.13 changes retrieval by exactly zero.** Published 0.9.10, 0.9.11, 0.9.12
and 0.9.13 produce byte-identical metrics on both packs. Every digit matches.

## All probe runs to date

| run | build | locomo ev@5 | locomo P@5 | locomo R@5 | locomo MRR | lme ev@5 | lme P@5 | lme R@5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.9.10 2026-09-03T05:54Z | npm | 0.590 | 0.232917 | 0.497917 | 0.37125 | 0.95 | 0.676667 | 0.95 |
| 0.9.1  2026-09-03T05:55Z | npm | 0.154 | 0.103750 | 0.129167 | 0.12500 | 0.00 | 0.000000 | 0.00 |
| 0.9.12 2026-09-03T20:55Z | source (#929 branch) | 0.590 | 0.147500 | 0.497917 | 0.37125 | 0.95 | 0.275000 | 0.95 |
| 0.9.12 2026-09-03T20:57Z | source (control) | 0.590 | 0.232917 | 0.497917 | 0.37125 | 0.95 | 0.676667 | 0.95 |
| **0.9.13 2026-09-04T06:57Z** | **npm** | **0.564** | **0.227917** | **0.485417** | **0.36625** | **0.95** | **0.676667** | **0.95** |
| 0.9.12 2026-09-04T06:58Z | npm | 0.564 | 0.227917 | 0.485417 | 0.36625 | 0.95 | 0.676667 | 0.95 |
| 0.9.10 2026-09-04T07:00Z | npm | 0.564 | 0.227917 | 0.485417 | 0.36625 | 0.95 | 0.676667 | 0.95 |
| 0.9.11 2026-09-04T07:01Z | npm | 0.564 | 0.227917 | 0.485417 | 0.36625 | 0.95 | 0.676667 | 0.95 |
| 0.9.13 2026-09-04T07:04Z | npm | 0.564 | 0.227917 | 0.485417 | 0.36625 | 0.95 | 0.676667 | 0.95 |
| 0.9.13 2026-09-04T07:05Z | npm | 0.564 | 0.227917 | 0.485417 | 0.36625 | 0.95 | 0.676667 | 0.95 |

## The committed reference no longer reproduces

`bin/probe`'s `REFERENCE_JSON` (locomo 0.590 / 0.232917 / 0.497917) was taken
from the 2026-09-03T05:54Z run of npm akm-cli@0.9.10. Re-running **that same
cached scratch install** on 2026-09-04 yields 0.564 / 0.227917 / 0.485417.

Same binary, same dataset, different day, different number. The probe therefore
grades every build as REGRESSED and exits 1, including builds that are
identical to the one that set the reference. **The reference cannot gate
anything until this is explained.** Do not re-baseline it to 0.564 first: an
unexplained number is not a reference (comparability rule A3).

Longmemeval is unaffected across both days on every metric.

### Ruled out

- **A code change in the locomo path.** The probe flattens LoCoMo itself and
  imports only `memory/backends/akm.ts`, `memory/retrieval-metrics.ts` and the
  *longmemeval* dataset module. The one harness commit in between (4f37322)
  touched none of those.
- **A dataset change.** `datasets/locomo/locomo10.json` is untracked and
  unmodified since 2026-05-05; sha256 `79fa87e9…`.
- **Nondeterminism.** Three consecutive 0.9.13 runs agree to every digit.
- **Ambient `AKM_*` leakage.** `buildHermeticEnv` strips every `AKM_*` and pins
  all five directories; the run body was already hermetic (the 4f37322 change
  hardened only the `--version` call, which cannot affect retrieval).
- **A runtime upgrade.** node v24.18.0 (June) and bun 1.3.14 (May) both predate
  every run here.
- **A remote embedding backend.** akm reads no `OPENAI_*` variable for
  embeddings.

### Root cause: the metric was measuring tie order

Dumping the probe's per-question hits settled it. On LoCoMo, **109 of the
returned hits carried the identical score 0.65, and 24 of 40 questions had a
top-5 that was entirely tied**. The number is `RELAXED_NON_NAME_SCORE_CEILING`
in `akm/src/indexer/search/ranking.ts`: any candidate admitted on the relaxed
tier whose *name* holds no query token is clamped to it.

Every LoCoMo document is a dialogue turn whose name is an opaque id (`D1:3`),
so no name ever holds a query token, so **every** candidate clamps to exactly
0.65. `buildSearchResultComparator` then compares equal scores, equal rounded
scores, equal name tiers and equal type boosts, and falls through to its last
resort — `a.filePath.localeCompare(b.filePath)`. Alphabetical filename order
decided which documents came back for 60% of the pack.

That is why the same binary moved between runs: nothing about *retrieval*
changed, only which of a large set of exactly-tied candidates surfaced first.
It also explains why longmemeval never moved (its names carry query tokens, so
the ceiling rarely binds) and why the #929 cascade patch read as pure noise —
it widened a candidate pool whose scores all collapse to one value.

Ruled out along the way, for the record: a local ONNX embedding path (no model
cache activity, and embeddings need explicit config), and locale-dependent
`localeCompare` (four locales, identical results).

### The fix

`applyRelaxedLexicalScoreCeiling` now records the pre-clamp score as
`preCeilingScore` — the same idiom `applyBeliefStateScoreCeiling` already
used — and the comparator orders on it before falling through to the
filename compare. Displayed scores are unchanged; only the order within a
clamped set changes.

Measured on the same probe, LoCoMo:

| metric | 0.9.13 published | with the fix | change |
| --- | --- | --- | --- |
| evidenceRecall@5 | 0.564 | **0.692** | +22.7% |
| recall@5 | 0.485417 | **0.591667** | +21.9% |
| precision@5 | 0.227917 | **0.257917** | +13.2% |
| MRR | 0.36625 | **0.4725** | +29.0% |
| nDCG@5 | 0.380024 | **0.492014** | +29.5% |

LongMemEval is unchanged on every metric (0.95 / 0.676667 / 0.95), as expected.

The probe now reports `tiedTopKRate` so a saturated run announces itself
instead of being mistaken for a version regression.

## Consequence for #929 / #930

Comparing like with like — the two source builds from 2026-09-03, run minutes
apart — the #929 cascade patch left recall untouched (0.590 / 0.497917,
identical) and cut precision hard (locomo 0.232917 → 0.147500, −37%;
longmemeval 0.676667 → 0.275000, −59%). That verdict stands, and is why #929
was closed and PR #931 abandoned.

#930 (BM25 field weights) remains untested. It should not be measured until the
reference above is trustworthy again.
