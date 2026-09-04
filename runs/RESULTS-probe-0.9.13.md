# Retrieval probe — 0.9.13 vs 0.9.10–0.9.12 (2026-09-04)

LLM-free Tier-1 retrieval probe (`bin/probe`), published npm builds, MAX_Q=40
(locomo, whole conv-26 slice) and MAX_Q=20 (longmemeval).

## Headline

Published 0.9.10 through 0.9.13 reproduce one another in the paired 2026-09-04
environment. They do **not** reproduce the older LoCoMo reference, so that
reference is not a release gate.

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

### The tie-order fix (#940), and the combined candidate

Issue #940 records the pre-relaxed-ceiling score separately from the belief
ceiling score, and the comparator orders on it before falling through to the
filename compare. Displayed scores are unchanged; only the order within a
clamped set changes.

That is distinct from #933, which changes score calibration. The integrated
release candidate therefore must be measured as a combination, not attributed
to #940 alone. Paired artifacts from the same evaluator commit, Bun 1.3.14,
and downloaded corpus are:

| build | artifact | LoCoMo ev@5 / P@5 / R@5 | LongMemEval ev@5 / P@5 / R@5 |
| --- | --- | --- | --- |
| published 0.9.13 | `0.9.13-2026-09-04T08-07-11Z` | .564 / .227917 / .485417 | .950 / .676667 / .950 |
| pre-#933/#940 (`3ad44a46`) | `0.9.13-2026-09-04T08-10-42Z` | .564 / .227917 / .485417 | .950 / .676667 / .950 |
| post-#933/pre-#940 (`11fb1f21`) | `0.9.13-2026-09-04T08-11-55Z` | .333 / .182917 / .260417 | .850 / .656667 / .850 |
| combined candidate (`d1b88cb3`) | `0.9.13-2026-09-04T08-08-38Z` | .667 / .262917 / .591667 | .900 / .666667 / .900 |

The combined candidate improves LoCoMo but regresses LongMemEval. It is not
approved for a judged run until that paired regression is resolved. The probe
reports `scoreSaturatedTopKRate` only as disclosure; use the explicit
identity-permutation gate to test whether generated identities affect ranking.

## Consequence for #929 / #930

Comparing like with like — the two source builds from 2026-09-03, run minutes
apart — the #929 cascade patch left recall untouched (0.590 / 0.497917,
identical) and cut precision hard (locomo 0.232917 → 0.147500, −37%;
longmemeval 0.676667 → 0.275000, −59%). That verdict stands, and is why #929
was closed and PR #931 abandoned.

#933 is score calibration; #940 is the relaxed-ceiling tie-order fix. Further
calibration work must use a paired control/candidate comparison, not the stale
LoCoMo reference above.
