# Retrieval judgment expansion — 2026-11-03 (UTC)

For [akm-eval#150](https://github.com/itlackey/akm-eval/issues/150). Results of akm 0.10 that nobody had graded (from akm#1272, fenced-code identifiers in the searched text) made `judged@10` of the library runs 0.94–0.97, and ungraded results count as not relevant.

Pool: every previously ungraded task-query/asset pair in the first ten results of any column (keyword search and curate, semantic search and curate) of the saved semantic `library` runs of akm `release/0.10.0` at `f8f97704` and three throwaway prototypes of akm#1260 (`2026-10-27-{b0,b1,b1b,b3}-sem-library`, 138 rows), and then of every published library run in `reports/` (18 folders, 0.9.32 to 0.10.261105-beta; 19 more rows). Non-task inputs still have no judgments. Queries, assets and existing grades are frozen. Result ranks and scores did not decide what was graded.

Grader: `evals/retrieval/label --from <run>`, the judge endpoint named by `JUDGE_MODEL` in `.env` (`eval-judge-35b`, a `models.json` line for `fast/qwen3.6-35b-a3b` on the lab gateway, `max_tokens` 64), temperature 0, prompt `umbrela-akm-v1`, the first 16,000 characters of each asset. Each row records `judge: fast/qwen3.6-35b-a3b`, the prompt digest, the UTC date and the asset digest, as label writes them. The qrels now hold grades of four sources (`legacy`, `chat/qwen3.8-27b`, `codex-review`, `fast/qwen3.6-35b-a3b`), and label and run warn about that.

| Pool | Added |
| --- | ---: |
| the four 2026-10-27 runs (b0 0, b1 103, b1b 6, b3 29) | 138 |
| 0.10.261018-beta | 1 |
| 0.10.261105-beta | 18 |
| every other published library run | 0 |
| all | 157 |

The 157 rows cover 71 queries: 117 of grade 0, 18 of grade 1, 11 of grade 2 and 11 of grade 3. None repeats a pair already graded. The library now has 2,033 rows (2,001 query/asset identities after alias normalization). Every column of every published library run is 100% judged.

One expected ref of the queries, q092's `commands/skills/ai-skills/opencode-extensions/references/commands`, is a ref akm 0.10 prints as `knowledge/...`; its pair is graded under both refs already (the 2026-10-15 expansion), so label passes over it instead of stopping (see `MEASUREMENT_CHANGELOG.md`).

This is a label-only change: retrieval `scoringVersion` 0.5. Rescore both sides of a comparison before reading it. Books were not expanded here: the books grades are #150's earlier change (scoring 0.4).
