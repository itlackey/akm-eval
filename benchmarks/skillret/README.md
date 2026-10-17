# skillret

Given a request, does akm rank the right skills first from a large skill library?

[SkillRet](https://github.com/ThakiCloud/SKILLRET) (Kang, Cho and Kim, 2026, [arXiv:2605.05726](https://arxiv.org/abs/2605.05726)) is a published test of exactly that. Its test split is 6,006 agent skills scraped from public GitHub repositories and 4,392 requests, each needing one skill (2,143), two (1,703) or three (546). This benchmark writes the skills into akm, asks `akm search` for the first 15 skills of every request, and scores it with SkillRet's metrics for akm's keyword search, and with `--semantic` for its semantic search too (its built-in embedder, bge-small-en-v1.5). It also asks `akm curate` for 200 of the requests and checks it returns search's ranking. No model service is called, and a run is deterministic.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
benchmarks/skillret/run                     # public: the test split, keyword search
benchmarks/skillret/run --semantic          # and semantic search too: 16 minutes to embed the skills the first time
benchmarks/skillret/run --corpus custom     # a library of the same size drawn from the train split
benchmarks/skillret/run --limit 200         # about a minute: to check a setup
```

- `--limit N` draws N queries at random under seed 42, in proportion to how many skills a query needs; the library stays whole.
- `--semantic` scores akm's semantic search too, with `--limit` or without it. Without it a run scores keyword search alone, a full one as well. akm embeds every skill when it builds the index, about 16 minutes the first time; the index is kept and reused (below).
- `--repeat N`: optional repeated collection. Deterministic search usually does not need repeats; each run is saved independently.
- There is no `--cases`: the custom corpus is a split of the dataset, not a folder.

A full public run with `--semantic` took 53 minutes the first time (16 to embed the skills) and about 37 with the semantic index kept. The semantic index is kept in `.cache/akm-index/skillret-public/` (`skillret-private/` for custom) and reused until a skill, akm, the embedding model or `src/akm.ts` changes. A semantic call loads the model in its own akm process (450 MB each, eight at once).

## The data

SkillRet v1.1 at Hugging Face revision `a050ad233a50`, pinned in `assets/ASSETS.lock`. The first run fetches what its corpus needs into `assets/` (124 MB public, 262 MB custom) and checks each file. The files are never committed: each skill keeps the licence of its source repository. SkillRet's own BM25 code, run once on the pinned files, gives the published BM25 row to the last digit.

The custom corpus draws 6,006 skills at random (seed 42) from the train split's own pool, which shares no skill with the test pool, then 4,392 train queries whose skills are all in that library, in the test split's mix of one, two and three skills. It is a different library with different queries, so it checks whether akm was tuned to the public items. Its queries are shorter (median 68 words against 169) and easier for keyword matching, so compare akm against BM25 on each corpus, not the two corpora's scores.

## How akm is used

Each skill is one file, `skills/<id>/SKILL.md`, holding the dataset's `skill_md`. Then `akm index --full` once per index, and for each request on each index:

```
akm search --limit 15 --detail agent --format json -- "<request>"     # --shape agent on akm 0.9.x
```

The keyword index is SQLite FTS5 with BM25 over each skill's name, description, tags and body (cut at 16,384 characters). The semantic index uses `semanticSearchMode: "auto"` with bge-small-en-v1.5 (512 tokens per skill), fused with the keyword ranking by reciprocal rank, so the semantic line is a hybrid. A semantic call whose answer does not say `searchMode: "semantic"` is a failed call; a call is killed after 120 seconds. A failed call is tried once more; one that fails twice is counted in `errored`, and its query is left out of that line's numbers. A run that asked every query is `complete` all the same, and exits 0; it is `aborted`, and exits 1, only when it stopped before the last query.

## How a query is scored

SkillRet's metrics at k = 5, 10 and 15, each a mean over every query; a query that gets no skill scores 0.

| Metric | Meaning |
|---|---|
| `NDCG@k` | gain 1 per needed skill in the first k, discounted by log2(rank + 1), against the best order |
| `Recall@k` | the share of needed skills in the first k |
| `Completeness@k` | the share of queries whose skills are all in the first k |
| `MAP@k` | average precision cut at k |

`score.test.ts` checks them against `pytrec_eval` on hand-made rankings. A mean over all 4,392 queries has a 95% interval of about 1.1 points of NDCG@10; a sample of 200, about 5.

## What the summary reports

`summary.json`: `metrics` for the keyword line, and the semantic line with `--semantic`, at 5, 10 and 15, `by_size` (per number of skills needed), `curate_check`, `status` and `aborted_reason`, `errored`, `timeouts`, `no_results`, `search_mode`, `semantic_index` (`cold`, `warm` or `rebuilt`) and `semantic_index_built_by`, `config` (per index), the dataset revision and checksums, `assets_sha256`, `seed` (42 for custom, null for public), the sample, the timings, `corpus_folder` (always null) and the `manifest`. `samples.jsonl`: one row per query with the skills it needs, the ids search returned on each index with times, each query's twelve `scores`, and curate's results for the 200.

## Results

akm 0.9.26, full runs of 2026-10-06, which scored the semantic search without being asked (today that takes `--semantic`). BM25 and the embedding rows are SkillRet's published numbers (Table 3), not run here; BM25's MAP (in italics) and the custom BM25 row come from SkillRet's BM25 code run once here.

| | NDCG@10 | Recall@10 | Completeness@10 | MAP@10 |
|---|---|---|---|---|
| public, akm search | 50.47 | 58.38 | 43.21 | 43.44 |
| public, akm search, semantic | 58.00 | 66.18 | 50.64 | 50.65 |
| public, BM25, published | 51.69 | 59.41 | 44.56 | *44.74* |
| public, bge-small-en-v1.5, published | 54.51 | 60.01 | 43.97 | - |
| public, Qwen3-Embedding-8B, published | 63.64 | 70.29 | 54.14 | - |
| custom, akm search | 72.35 | 74.06 | 55.17 | 65.71 |
| custom, akm search, semantic | 68.54 | 72.36 | 53.80 | 61.44 |
| custom, BM25, run here | 72.89 | 74.35 | 55.31 | 66.26 |

- akm's keyword search is just under BM25 on both corpora: 1.22 points of NDCG@10 on public (±0.71), 0.54 on custom (±0.57). A ranking tuned to the public items would stand better there, and it does not.
- Semantic search adds 7.5 points on public and costs 3.8 on custom, where keyword search is already strong: what the vectors add depends on the queries.
- curate returned search's ranking for all 200 checked queries on both indexes, so it is not scored.
- The retrievers read different text (akm cuts the body; bge reads 512 tokens), so these rows are a guide, not a controlled comparison.

## Licence

The code is MPL-2.0. The dataset is not part of this repository; see `../../NOTICE` for SkillRet's credit and licences. akm's embedding model, bge-small-en-v1.5 by BAAI (MIT), is downloaded when needed.
