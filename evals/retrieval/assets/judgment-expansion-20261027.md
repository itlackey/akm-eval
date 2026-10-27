# Retrieval judgment expansion — 2026-10-27 (UTC)

For [akm#1260](https://github.com/itlackey/akm/issues/1260) (fenced code in search). The prototypes of that spike return `library` results nobody had graded, so their `judged@10` was 95–96% and a comparison with the b0 baseline would count those results as not relevant.

Pool: every previously unjudged task-query/asset pair in the first ten results of any column (keyword search and curate, semantic search and curate) of four saved semantic `library` runs, `2026-10-27-{b0,b1,b1b,b3}-sem-library`: akm `release/0.10.0` at `f8f97704` and its throwaway prototypes `spike/1260-b1`, `spike/1260-b1b` and `spike/1260-b3`. Non-task inputs still have no judgments. Queries, assets and existing grades are frozen. Result ranks and scores did not decide what was graded.

Grader: `evals/retrieval/label --from <run>`, the judge endpoint named by `JUDGE_MODEL` in `.env` (`eval-judge-35b`, a `models.json` line for `fast/qwen3.6-35b-a3b` on the lab gateway, `max_tokens` 64), temperature 0, prompt `umbrela-akm-v1`, the first 16,000 characters of each asset. Each row records `judge: fast/qwen3.6-35b-a3b`, the prompt digest, the UTC date and the asset digest, as label writes them. This is a judge endpoint, unlike the 2026-10-15 expansion's model review in the maintenance session; the qrels now hold grades of four sources (`legacy`, `chat/qwen3.8-27b`, `codex-review`, `fast/qwen3.6-35b-a3b`), and label and run warn about that.

| Run | Pooled pairs | Already graded | Added |
| --- | ---: | ---: | ---: |
| b0 | 1,510 | 1,510 | 0 |
| b1 | 1,510 | 1,407 | 103 |
| b1b | 1,508 | 1,502 | 6 |
| b3 | 1,514 | 1,485 | 29 |
| all | | | 138 |

The 138 rows cover 69 queries: 103 of grade 0, 14 of grade 1, 10 of grade 2 and 11 of grade 3. None repeats a pair already graded. The library now has 2,014 rows (1,982 query/asset identities after alias normalization). Every column of the four runs is 100% judged.

One expected ref of the queries, q092's `commands/skills/ai-skills/opencode-extensions/references/commands`, is a ref akm 0.10 prints as `knowledge/...`; its pair is graded under both refs already (the 2026-10-15 expansion), so label now passes over it instead of stopping (see `MEASUREMENT_CHANGELOG.md`).

This is a label-only change: retrieval `scoringVersion` 0.4. Rescore both sides of a comparison before reading it. Books were not expanded: label grades the `library` collection of a public run, and the books' result lists are identical on all four builds.
