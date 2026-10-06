# skillret

Given a request, does akm rank the right skills first from a large skill library?

[SkillRet](https://github.com/ThakiCloud/SKILLRET) (Kang, Cho and Kim, 2026, [arXiv:2605.05726](https://arxiv.org/abs/2605.05726)) is a published test of exactly that, built by others. Its test split is a library of 6,006 agent skills scraped from public GitHub repositories, and 4,392 requests written for it. A request needs one skill (2,143 requests), two (1,703) or three (546), and the benchmark counts how high a retriever puts them: NDCG, Recall, Completeness (all the skills a request needs are in the first k) and MAP, at k = 5, 10 and 15.

This benchmark writes the skills into akm as assets, asks `akm search` and `akm curate` for the first 15 skills of every request, and scores them with the benchmark's metrics. It prints the result beside the numbers SkillRet's paper reports for BM25 and for embedding models, which are theirs and are not run here.

No model runs when you run it. akm searches with keywords, and the run is deterministic.

## Run

```
benchmarks/skillret/run --corpus public
benchmarks/skillret/run --corpus private
benchmarks/skillret/run --corpus all
benchmarks/skillret/run --limit 200
```

- `--corpus` picks the library and the queries. `public` is SkillRet's test split. `private` is a library of the same size drawn from its train split: see "The private corpus". `all` runs both and prints them side by side, never as one number.
- `--limit N` runs N queries, drawn at random under seed 42 in proportion to how many skills a query needs. It is never the first N. The library stays whole, so a limited run is as hard per query as the full one, only noisier.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default label is `akm-<version>`.

Each run writes two files to `benchmarks/skillret/results/<UTC date>-<label>/`, or to `private/skillret/results/` for the private corpus:

- `summary.json`: the metrics of search and of curate at 5, 10 and 15, the same for the queries that need one, two and three skills, the number of failed calls and of queries that got no skill, the akm version and search mode, the dataset revision and checksums, how the sample was drawn, how long indexing and the queries took, and the git commit.
- `samples.jsonl`: one line per query, in the order of the dataset, with the request, the ids of the skills it needs, the ids that search and curate returned in order, and how long each took.

## What it needs

[bun](https://bun.sh), and akm on `PATH` or named in `AKM_BIN`. No model, no key. The network is used once, to fetch the data (see "The data").

The benchmark gives akm a temporary folder with its own config and folders, writes the 6,006 skills into it, and indexes them with `akm index --full`. It never reads or writes your akm bundle. The folder takes about 50 MB for the skills and 80 MB for akm's index, and is removed when the run ends. `private` reads the 188 MB file of train skills whole, which takes about 1.2 GB of memory for ten seconds.

A full run of one corpus takes about 14 minutes: 25 s to write and index the 6,006 skills, then 8,784 calls, eight at a time, in 13.6 minutes for `public` and 12.3 for `private`. The machine had 12 cores and was busy with other work, with a load average between 8 and 27. A search takes 0.3 s on its own, nearly all of it akm starting up. With eight in flight, a search took 0.55 s on average and a curate 0.94 s. `--limit 200` takes about a minute.

## The data

The data is SkillRet v1.1 at Hugging Face revision `a050ad233a50`, pinned in `assets/ASSETS.lock` with the size, sha256 and line count of each of the six files (the skills, queries and qrels of the test and train splits). The first run fetches what its corpus needs into `assets/` (124 MB for `public`, 262 MB for `private`), checks each file against the lock, and stops if one differs. Later runs use those copies. The files are git-ignored: the dataset is Apache-2.0, but each skill text is scraped from a public GitHub repository and keeps its own licence (MIT or Apache-2.0, named in its record), so it is fetched and never committed or redistributed.

**Which revision.** The Hub's head is a moving target, and SkillRet's own README says an unpinned run is not reproducible. It also moved the test split once. On 2026-07-29, v1.1 filtered the evaluation split: 6,660 skills, 4,997 queries and 8,347 labels became 6,006, 4,392 and 7,187. Nothing was added: v1.1 is v1.0 less 654 skills, 605 queries and their labels. The README and the paper (v3) report their numbers on v1.1, and say that scores on the two versions are not comparable. The paper's 46%, 40% and 13% of queries that need one, two and three skills describe the split before the filter (46.4%, 40.1% and 13.4%). v1.1 has 48.8%, 38.8% and 12.4%.

The Hub head, `6583d7d` on 2026-10-05 and still on 2026-10-06, differs from `a050ad2` in the README's citation (the author order) and in nothing else: all six data files have the same sha256 at both. So the pin could be either, and it is `a050ad2`, the revision SkillRet's README uses in its examples. To check that the pinned files are the ones the published numbers come from, SkillRet's own BM25 baseline (its `eval_bm25` and `trec_eval`, with `bm25s` and `pytrec_eval`) was run on them once. It gives the published BM25 row to the last digit: NDCG 49.31, 51.69 and 52.75, Recall 53.03, 59.41 and 62.92, Completeness 38.21, 44.56 and 47.93.

## How akm is used

For each skill, one file, `skills/<id>/SKILL.md` in the bundle, holding the `skill_md` field as the dataset has it: the front matter and the body. The id is the dataset's, because skill names are not unique (153 names occur more than once in the test pool). akm names a skill by its directory, so with this layout it indexes the skill's id and not its own name. Naming the directories `<name>-<id>` instead moved NDCG@10 by +0.01 on a sample of 800 queries (measured once, not part of the benchmark), so the layout does not hold akm back.

Then, once:

```
akm index --full
```

and for each request, as written in the dataset, which is a paragraph or several:

```
akm search --limit 15 --shape agent --format json -- "<request>"
akm curate --limit 15 --shape agent --format json -- "<request>"
```

akm runs with semantic search off, which is also its default, so the numbers come from its keyword index: SQLite FTS5 with BM25 over each skill's name, description, tags and body, with Porter stemming, and the request's words, minus stopwords, joined with OR. The body is a projection of the file without its front matter, comments, fenced code and link targets, cut at 16,384 characters. Embeddings are not scored. akm 0.9.26's built-in embedder is bge-small-en-v1.5, which it downloads from the Hugging Face Hub (133 MB) when it first builds an index, and this benchmark downloads no model. The paper's bge-small-en-v1.5 row (NDCG@10 54.51) is the nearest published number, though it has no akm around it.

One call of each, for 15 results, serves all three cut-offs: the first 5 and the first 10 of a `--limit 15` list are what `--limit 5` and `--limit 10` return (checked on 40 requests: 160 comparisons, no difference).

curate runs the same search and adds a preview to each result. Its reranker is off by default, so it returns the same skills in the same order as search. It would return nothing for a request that starts with `<` and contains `</`, which it takes for a harness envelope, and none of SkillRet's requests does. Both are scored, so a change in either shows.

**Several calls at a time.** A full run is 8,784 calls, each of which starts akm, so eight run at once against the one index. A search reads the index and writes only its usage log, which does not feed the ranking, and akm 0.9.26 does not re-index on a read: a result depends on the request and the index alone. The rankings of 96 requests were identical with 1, 4, 8 and 12 calls at a time, for search and for curate. A call that fails is made once more, and one that fails twice is counted in `errored` and left out of that command's numbers, and the run exits with 1.

## The private corpus

SkillRet's train split has a skill pool of its own: 10,123 skills that share no skill with the test pool (no id, no text and no source URL). `private` draws a library from it:

- 6,006 of the train skills, at random under seed 42, as many as the test pool has;
- the train queries whose skills are all in that library: 24,155 of 63,259;
- 4,392 of those, at random, in the test split's mix: 2,143 that need one skill, 1,703 two and 546 three. Train queries need one, two and three skills in equal parts, and a sample left like that would be harder to complete than the public one.

`--limit` draws from those 4,392 the same way as for `public`. The draw is deterministic: seed 42 is in `summary.json`, so the same library and the same queries come back. 4,276 of the 6,006 skills are needed by one of the 4,392 queries, against 5,640 in the public library.

The other private corpora in this repository are the public ones with their names and numbers rewritten. This one is a different library with different queries, so it checks whether akm's public score has come from tuning to the public items. It hides nothing: the train split is public, and the seed is in the code. There is nothing for `./generate-assets` to make: the library and the queries are drawn when the run starts.

A private score is not comparable to the public one without care, because the queries differ. The train queries are written by another model (Qwen3.5-122B-A10B, against Claude Opus 4.6 for the test queries) and are shorter: the private queries have a median of 68 words, the public ones 169. SkillRet's paper says the long, scenario-rich test queries are harder for lexical matching. A private score above the public one is what to expect, and says little about tuning on its own. So the results below put SkillRet's BM25 code, run on the same private library and queries, beside akm: the question is whether akm stands the same against it on both corpora.

## Read the results

The metrics are SkillRet's, at k = 5, 10 and 15. Each is a mean over every query, and a query that gets no skill scores 0.

| Metric | Meaning |
|---|---|
| `NDCG@k` | Gain 1 for each needed skill in the first k, discounted by log2 of its rank + 1, against the best order of the skills the query needs. |
| `Recall@k` | The share of the skills a query needs that are in the first k. |
| `Completeness@k` | The share of queries whose skills are all in the first k. |
| `MAP@k` | Average precision cut at k: the precision at each needed skill found in the first k, summed, divided by the number of skills the query needs. |

These are SkillRet's own scoring, by `pytrec_eval`. `score.test.ts` holds pytrec_eval's output for eleven hand-made rankings, with a needed skill at, before and after each cut-off, one to three skills needed, short lists and an empty one, and checks all four metrics against it. Scoring the rankings of SkillRet's own BM25 baseline over the 4,392 queries, `score.ts` gives the published BM25 row to the last digit, and the MAP that pytrec_eval gives, 43.58, 44.74 and 45.10, which the paper does not report.

akm 0.9.26, keyword search, full runs of 2026-10-06 at the pinned revision. Rows marked published are SkillRet's numbers (Table 3 of its paper) for other retrievers, which are theirs and are not run here. The paper has no MAP, so the BM25 cells in italics come from running SkillRet's BM25 code here. Everywhere in this README, "run here" means SkillRet's own `eval_bm25` and `trec_eval` (bm25s 0.3.12 and pytrec-eval-terrier 0.5.10) run once on the pinned files. They are not part of this repository.

**Public: the test split, 6,006 skills and 4,392 queries.**

| | NDCG@5 | NDCG@10 | NDCG@15 | Recall@5 | Recall@10 | Recall@15 | Completeness@5 | Completeness@10 | Completeness@15 | MAP@5 | MAP@10 | MAP@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| akm search | 47.95 | 50.47 | 51.70 | 51.50 | 58.38 | 62.42 | 36.43 | 43.21 | 47.31 | 42.24 | 43.44 | 43.87 |
| akm curate | 47.95 | 50.47 | 51.70 | 51.50 | 58.38 | 62.42 | 36.43 | 43.21 | 47.31 | 42.24 | 43.44 | 43.87 |
| BM25, published | 49.31 | 51.69 | 52.75 | 53.03 | 59.41 | 62.92 | 38.21 | 44.56 | 47.93 | *43.58* | *44.74* | *45.10* |
| bge-small-en-v1.5 (33M), published | 52.57 | 54.51 | 55.45 | 54.73 | 60.01 | 63.07 | 38.96 | 43.97 | 47.11 | - | - | - |
| bge-large-en-v1.5 (335M), published | 57.04 | 59.00 | 59.80 | 59.19 | 64.37 | 66.95 | 42.96 | 48.34 | 50.80 | - | - | - |
| Qwen3-Embedding-8B, published | 61.35 | 63.64 | 64.73 | 64.24 | 70.29 | 73.76 | 47.43 | 54.14 | 58.15 | - | - | - |
| SKILLRET-Embedding-8B (their fine-tune), published | 84.58 | 86.44 | 86.95 | 88.55 | 93.25 | 94.84 | 80.35 | 88.11 | 90.80 | - | - | - |

By how many skills a query needs, at 10. The BM25 row is SkillRet's code run here. The last two are from Table 5 of the paper, which reports them for the 0.6B models only.

| | NDCG@10, 1 skill (2,143 queries) | NDCG@10, 2 skills (1,703) | NDCG@10, 3 skills (546) | Completeness@10, 1 | Completeness@10, 2 | Completeness@10, 3 |
|---|---|---|---|---|---|---|
| akm search | 55.42 | 47.16 | 41.33 | 68.27 | 23.84 | 5.31 |
| akm curate | 55.42 | 47.16 | 41.33 | 68.27 | 23.84 | 5.31 |
| BM25, run here | 57.74 | 47.77 | 40.13 | 70.51 | 24.49 | 5.31 |
| Qwen3-Embedding-0.6B, published | 74.0 | 53.6 | 40.6 | 83.8 | 25.8 | 1.8 |
| SKILLRET-Embedding-0.6B, published | 84.2 | 79.6 | 73.7 | 92.1 | 74.2 | 42.1 |

- akm's keyword search lands just under BM25: NDCG@10 is 50.47 against 51.69, Recall@10 58.38 against 59.41, Completeness@10 43.21 against 44.56. On the same queries akm is 1.22 points of NDCG@10 below BM25, with a 95% interval of 0.71 either way, so the gap is real and small.
- It is under the four embedding models in the table, by 4 points of NDCG@10 (bge-small-en-v1.5, the model akm's own embedder would use) to 36 points (SkillRet's fine-tuned 8B model). Two of the 19 retrievers in the paper's table score below it: e5-small-v2 (44.66) and F2LLM-v2-80M (48.22).
- A query that needs more skills is harder. Completeness@10 is 68% when a query needs one skill, 24% for two and 5% for three, and BM25 does the same (71%, 24% and 5%). 964 of the 4,392 queries (22%) get none of their skills in the first 15.
- search and curate return the same 15 skills in the same order for every query, so their rows are equal. No call failed and every query got 15 skills.
- The run is deterministic: two full runs, one before the benchmark was committed and one after, gave the same 15 skills in the same order for all 4,392 queries, in both commands.
- A mean over all 4,392 queries has a 95% interval of about 1.1 points of NDCG@10, since the standard deviation of a query's NDCG@10 is 0.38. A sample of 200 has about 5 points. Use `--limit` to check that a setup runs, or to catch a large change, and not to compare two akm versions.
- What each retriever reads differs, so the rows are not a like-for-like comparison of ranking methods. bm25s indexes the name, the description and the whole SKILL.md. bge-small and bge-large read the first 512 tokens of a skill, Qwen3-Embedding-8B up to 32,768. akm indexes a projection of the body cut at 16,384 characters.

**Private: a library from the train split, 6,006 skills and 4,392 queries.** The BM25 rows are SkillRet's BM25 code run here on the same library and queries, to compare akm with something that has seen neither.

| | NDCG@5 | NDCG@10 | NDCG@15 | Recall@5 | Recall@10 | Recall@15 | Completeness@5 | Completeness@10 | Completeness@15 | MAP@5 | MAP@10 | MAP@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| private, akm search | 70.96 | 72.35 | 73.00 | 70.38 | 74.06 | 76.13 | 51.07 | 55.17 | 57.65 | 64.97 | 65.71 | 65.96 |
| private, akm curate | 70.96 | 72.35 | 73.00 | 70.38 | 74.06 | 76.13 | 51.07 | 55.17 | 57.65 | 64.97 | 65.71 | 65.96 |
| private, BM25, run here | 71.70 | 72.89 | 73.47 | 71.22 | 74.35 | 76.22 | 51.73 | 55.31 | 57.67 | 65.62 | 66.26 | 66.49 |
| public, akm search, for comparison | 47.95 | 50.47 | 51.70 | 51.50 | 58.38 | 62.42 | 36.43 | 43.21 | 47.31 | 42.24 | 43.44 | 43.87 |
| public, BM25, published, for comparison | 49.31 | 51.69 | 52.75 | 53.03 | 59.41 | 62.92 | 38.21 | 44.56 | 47.93 | *43.58* | *44.74* | *45.10* |

| private | NDCG@10, 1 skill (2,143 queries) | NDCG@10, 2 skills (1,703) | NDCG@10, 3 skills (546) | Completeness@10, 1 | Completeness@10, 2 | Completeness@10, 3 |
|---|---|---|---|---|---|---|
| akm search | 84.11 | 63.92 | 52.54 | 90.67 | 27.13 | 3.30 |
| akm curate | 84.11 | 63.92 | 52.54 | 90.67 | 27.13 | 3.30 |
| BM25, run here | 85.29 | 63.68 | 52.96 | 91.51 | 26.37 | 3.48 |

- akm scores 22 points higher on the private queries than on the public ones (NDCG@10 72.35 against 50.47), and BM25 gains as much (72.89 against 51.69). So the gap comes from the data and not from akm: the private queries are shorter and, the paper says, easier for keyword matching.
- akm is 0.54 points of NDCG@10 below BM25 on the private queries, with a 95% interval of 0.57 either way, against 1.22 below on the public split. A ranking tuned to the public items would stand better against BM25 there than here, and akm stands slightly worse there.
- 5% of the private queries (225) get none of their skills in the first 15, against 22% of the public ones.
- As on the public split, search and curate return the same skills for every query, no call failed, and every query got 15 skills.

## Licence

The code is MPL-2.0, like the rest of this repository. The dataset is not part of it and is not redistributed. See `../../NOTICE` for SkillRet's credit and licences.
