# Repo-map assets and fenced code in search: b0 baseline (work in progress, phase 1)

**Work in progress / phase 1.** Collected October 27, 2026 UTC for [akm#1260](https://github.com/itlackey/akm/issues/1260). This is the b0 baseline of the spike: akm as it is, with no prototype. It holds no decision on either question of the issue, and it is not in the ledger table of [`../README.md`](../README.md) yet. The B1–B3 prototypes, the agent-ab repomap tasks and the decisions come in later phases.

## What ran

| | |
|---|---|
| akm | `release/0.10.0` at `f8f97704` (includes the `toc` of `akm show`), run from source as `--akm "bun <akm>/src/cli.ts"`; reports 0.10.261015, build `f8f977046` |
| akm-eval | the public collections at `main` `556b869`; the new sets at this branch (`c4df419`, `code` rerun on the final qrels) |
| Runner | `evals/retrieval/run`, natively with Bun 1.4.4, not in the Docker image |
| Search | **keyword only**. huggingface.co was unreachable from the session, so akm could not download its embedding model and nothing ran with `--semantic`. The issue asks for semantic runs; they are still to do |
| Sets | `library` and `books` (public collections), and three new sets run with `--cases`: [`code`](../../evals/retrieval/assets/code/README.md), [`repomap`](../../evals/retrieval/assets/repomap/README.md) and its `repomap/fenced` variant |

**The grades of the new sets are provisional.** No judge endpoint was reachable, so every pair was graded by model review in the maintenance session (`judge: claude-review`, [protocol](../../evals/retrieval/assets/judgment-review-20261027.md)), as the 2026-10-15 expansion of the public sets was. Grade them again with `evals/retrieval/label` and a real judge, then rescore both sides, before trusting a difference. The public collections keep their frozen grades.

The three new sets are custom-corpus runs (`corpus: custom`, collection `own`) of sets committed in this repository, not private cases, so they are published here. The ledger leaves custom runs out; the `library` and `books` runs are public and the ledger lists them.

## Result

`search` and `curate` returned the same assets in the same order for every task query of every set, so one column is shown. They differ only on 5 of the library's 25 non-task inputs, where curate returned nothing and search returned ten results. The `library` and `books` runs used every query.

| Set | Assets | Queries scored | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | Wall time |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [`library`](retrieval/2026-10-27-b0-f8f97704-library) | 251 | 101 of 136 | 0.757 | 0.911 | 0.745 | 97.0% | 100.0% | 130.2 s |
| `library`, the 21 `name` queries | 251 | 21 | 0.836 | 0.952 | 0.849 | 95.2% | 100.0% | |
| [`books`](retrieval/2026-10-27-b0-f8f97704-books) | 93 | 51 | 0.836 | 0.905 | 0.937 | 100.0% | 94.9% | 47.6 s |
| [`code`](retrieval/2026-10-27-b0-f8f97704-code-own) | 251 | 30 | 0.526 | 0.495 | 0.667 | 63.3% | 100.0% | 29.3 s |
| [`repomap`](retrieval/2026-10-27-b0-f8f97704-repomap-own), inline code | 15 | 20 | 0.849 | 0.858 | 1.000 | 90.0% | 100.0% | 18.7 s |
| [`repomap/fenced`](retrieval/2026-10-27-b0-f8f97704-repomap-fenced-own) | 15 | 20 | 0.485 | 0.433 | 0.650 | 65.0% | 100.0% | 18.0 s |

`books` keeps a banned asset above a relevant one in 23.5% of queries (above the first relevant one in 15.7%), and its judged@10 of 94.9% means this build surfaces a few books results nobody has graded. The `name` slice is computed from the library run's `samples.jsonl`. Wall time includes indexing.

What the baseline shows, before any prototype:

- **`name` queries.** 20 of the 21 put a relevant asset first. The one miss, `q107` "Palatino Linotype Book Antiqua font stack" (nDCG 0.144, no relevant asset in the first 10), is the one `name` query whose answer sits only inside a fenced CSS block of `CSS_PRINT`.
- **`code`.** By kind (nDCG@10, MRR): identifier 0.460, 0.403 (8 queries); config key 0.600, 0.643 (7); flag 0.463, 0.500 (5); snippet 0.598, 0.422 (5); error 0.650, 0.667 (3); environment variable 0.315, 0.250 (2). One query in three has no relevant asset in the first five.
- **`repomap`.** The two variants hold the same files and symbols; only the rendering differs. With inline code the identifier queries score nDCG 0.895 and MRR 0.907 (9 queries); with fenced code 0.167 and 0.148, and 7 of the 9 return no result at all, since only the `## File:` headings of the fenced assets reach the index. The concept queries score 0.812, 0.818 inline and 0.745, 0.667 fenced (11). With 15 assets a random ranking already puts a relevant asset in the first 10 of most queries, so read MRR and nDCG here, not recall.

## Limits

- Keyword search only; no semantic column.
- One run of each set. Keyword retrieval is deterministic for one build and one library, so repeats would add little.
- The new sets are small (20 to 30 queries; one query moves a mean by 0.03 to 0.05), were written and graded by one model, and their grades are provisional.
- `repomap` measures finding the right directory's map, not the file or symbol inside it.

```sh
scripts/compare/run reports/repomap-codeblocks-2026-10-27/retrieval/2026-10-27-b0-f8f97704-repomap-own reports/repomap-codeblocks-2026-10-27/retrieval/2026-10-27-b0-f8f97704-repomap-fenced-own
```
