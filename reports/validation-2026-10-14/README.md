# Docker validation and explicit rescoring — 2026-10-14

These saved public observations contain the corrected Reflect scores and
expanded-label retrieval results. Superseded original scoring folders were deleted.
The retained rescores include the saved raw outputs and timings; no collection was
restarted for this cleanup.

## Reflect: 35B, semantic configured

- [Explicit rescore](../0.10.261003-beta/reflect/docker-35b-semantic-full-20261014-rescored/summary.json): **73/80 correct**, collector 0.3, scorer 0.4.
- Exactly one case changes: `description-truncated-03`, whose grounded `PDFs` plural was incorrectly rejected when the source said `PDF`. All saved proposals, outcomes and timings are identical.
- Model route `fast/qwen3.6-35b-a3b`; all 80 served replies identify `qwen3.6-35b-a3b`. Zero execution errors/timeouts; wall time 284.055 seconds. Provider billing was not recorded.
- Native BGE embeddings were verified for all 80 planted assets. This standard Reflect run performed zero retrieval searches, so it establishes configuration/index coverage, not retrieval quality. The dedicated retrieval runs below exercise semantic search.

## Full public retrieval

[Library](../0.10.261003-beta/retrieval/docker-semantic-full-20261014-library-rescored/summary.json)
and [books](../0.10.261003-beta/retrieval/docker-semantic-full-20261014-books-rescored/summary.json)
use the expanded judgments.

The original Docker collection covered 136 library and 51 books queries over
251 and 93 assets. All semantic searches used native BGE; saved index/event
checks verified all 344 embeddings and 189 semantic searches including two
setup probes, with zero fallback, unknown modes, query errors or timeouts.
This eval makes no chat-model calls. Whole-container elapsed time was 392
seconds including indexing/startup; the old collector did not record per-
collection wall time, which remains unknown in these artifacts.

| Collection | Labels | Keyword nDCG@10 | Semantic nDCG@10 | Keyword judged top ten | Semantic judged top ten |
| --- | --- | ---: | ---: | ---: | ---: |
| library | expanded | 0.7573 | 0.8260 | 100% | 100% |
| books | expanded | 0.8275 | 0.9093 | 100% | 100% |

The rescores change relevance labels only: they demonstrate label sensitivity,
not an AKM build improvement. Inputs, ranking order, query timings, errors and
settings are preserved. Collector remains 0.2; scorer is 0.3. The original
collection digests remain provenance; the current label digests are in each
rescored manifest's cases. All 25 non-task inputs and ten no-answer tasks
retain their meaning. Abstention remains weak: curate abstained on only one
non-task input and on no no-answer task in the original full run.

[Judgment protocol](../../evals/retrieval/assets/judgment-expansion-20261015.md):
866 missing pairs added (374 library, 492 books). Thirty library rows reuse a
verified same-file judgment under a changed ref classification; 836 are Codex
review. The 33 new ref-variant rows declare `alias_of` for five verified
same-file notes: ideal ranking and recall count each asset once, and raw refs
remain intact. Original Qwen/legacy/E6 grades and all 99 banned pairs are intact.
Reflect's optional `--retrieval-queries` also reads these labels: future runs
cover 77 planted notes instead of 75, recorded as Reflect collection 0.4. The
published standard Reflect run did not use that option and is unaffected.

These are mixed-reviewer, model-generated labels, without human agreement
measurement. Coverage is complete for this observed pool; future results may
need new judgments. Compare only the same frozen inputs and label digests.

## Bounded build comparison and tooling checks

[Build validation](../0.9.31/README.md) publishes both clean source commits,
the four expanded-label rescores and saved comparisons. Quality deltas are zero
for corresponding build runs. Each collection has one observation per build: timings validate
measurement/reporting and do not establish a performance improvement.

## Reproduction provenance

- Full Reflect and retrieval collection image: `ghcr.io/itlackey/akm-eval@sha256:56fb264d315dcbd792906aa406d755726eaaa2c0e4b5fab1f83d7ffe454780b6`, source `af0ab891b524f6bad0f3806e4dbbf04a592787e6`, AKM `0.10.261003-beta`.
- Build-validation image layers the cleanup at `763b9d4f56a524ecb533cd1def46a79b3bf4cf94` over that image, with preinstalled dependencies and read-only AKM source mounts. Docker networking was disabled.
- Published cleanup image: `ghcr.io/itlackey/akm-eval@sha256:a840030f65e3d3456b6c4bad4ebe63876122937fb108dc8fb5631c86d3cfce63`, main `b77cbbe9c24d738ffd40a6ef7ab259354b7190dd`.
- This publication's retrieval rescores use that prebuilt image with the updated repository/labels mounted, networking disabled, and the existing `scripts/rescore/run`. No indexing, collector, chat-model or external judge run was started.
