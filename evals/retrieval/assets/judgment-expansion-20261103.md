# Retrieval judgment expansion — 2026-11-03 (UTC)

For [akm-eval#150](https://github.com/itlackey/akm-eval/issues/150). Results of akm 0.10 that nobody had graded (from akm#1272, fenced-code identifiers in the searched text) made `judged@10` of the library runs 0.94–0.97, and ungraded results count as not relevant.

Pool: every previously ungraded task-query/asset pair in the first ten results of any column (keyword search and curate, semantic search and curate) of the saved semantic `library` runs of akm `release/0.10.0` at `f8f97704` and three throwaway prototypes of akm#1260 (`2026-10-27-{b0,b1,b1b,b3}-sem-library`, 138 rows; those runs are in akm-eval PR #145, head `ec96a2e`), and then of every published library run in `reports/` (18 folders, 0.9.32 to 0.10.261105-beta; 19 more rows). Non-task inputs still have no judgments. Queries, assets and existing grades are frozen. Result ranks and scores did not decide what was graded.

Grader: `evals/retrieval/label --from <run>`, the judge endpoint named by `JUDGE_MODEL` in `.env` (`eval-judge-35b`, a `models.json` line for `fast/qwen3.6-35b-a3b` on the lab gateway, `max_tokens` 64), temperature 0, prompt `umbrela-akm-v1`, the first 16,000 characters of each asset. Each row records `judge: fast/qwen3.6-35b-a3b`, the prompt digest, the UTC date and the asset digest, as label writes them. The qrels now hold grades of five judge labels (`legacy`, `chat/qwen3.8-27b`, `codex-review`, `fast/qwen3.6-35b-a3b`, `claude-review`), and label and run warn about that.

| Pool | Added |
| --- | ---: |
| the four 2026-10-27 runs (b0 0, b1 103, b1b 6, b3 29) | 138 |
| 0.10.261018-beta | 1 |
| 0.10.261105-beta | 18 |
| every other published library run | 0 |
| all | 157 |

The 157 rows cover 71 queries: 117 of grade 0, 19 of grade 1, 11 of grade 2 and 10 of grade 3, after the correction below. None repeats a pair already graded. The library now has 2,033 rows (2,001 query/asset identities after alias normalization). Every column of every published library run is 100% judged.

One expected ref of the queries, q092's `commands/skills/ai-skills/opencode-extensions/references/commands`, is a ref akm 0.10 prints as `knowledge/...`; its pair is graded under both refs already (the 2026-10-15 expansion), so label passes over it instead of stopping (see `MEASUREMENT_CHANGELOG.md`).

Correction: the judge gave q012 ("report-orchestrator", expected `agents/report-orchestrator`) a 3 for `agents/print/qa-coordinator`. That agent orchestrates QA of the print pipeline of tabletop RPG books; it is not a report orchestrator. The query's other grades set the scale: `refactoring-orchestrator` 1, `report-reviewer` 1, `markdown-pdf-pipeline` (a print orchestrator) 2, `commands/print/generate-report` 2. It was re-graded 1 in a review by Claude in the maintenance session (`judge: claude-review`, 2026-11-03, no prompt digest; the asset digest is unchanged), on the protocol of the [2026-10-15 expansion](judgment-expansion-20261015.md): read the query and the asset, grade 0 to 3 by the same rubric. That row replaces the judge's, so the fast 35B holds 117, 18, 11 and 10 rows of grade 0 to 3 (156 rows) and `claude-review` one of grade 1. The other 156 rows were not re-reviewed.

This is a label-only change: retrieval `scoringVersion` 0.5. Rescore both sides of a comparison before reading it. Books were not expanded here: the books grades are #150's earlier change (scoring 0.4).
