# skillret

Given a request, does akm rank the right skills first from a large skill library?

[SkillRet](https://github.com/ThakiCloud/SKILLRET) (Kang, Cho and Kim, 2026, [arXiv:2605.05726](https://arxiv.org/abs/2605.05726)) is a published test of exactly that, built by others. Its test split is a library of 6,006 agent skills scraped from public GitHub repositories, and 4,392 requests written for it. A request needs one skill (2,143 requests), two (1,703) or three (546), and the benchmark counts how high a retriever puts them: NDCG, Recall, Completeness (all the skills a request needs are in the first k) and MAP, at k = 5, 10 and 15.

This benchmark writes the skills into akm as assets, asks `akm search` for the first 15 skills of every request, and scores it with the benchmark's metrics. It does so twice: with akm's keyword search, and with its semantic search, which is akm's built-in embedder, bge-small-en-v1.5. It also asks `akm curate` the same for 200 of the requests, and checks that it returns the same skills as search. It prints the results beside the numbers SkillRet's paper reports for BM25 and for embedding models, among them bge-small-en-v1.5 itself, which are theirs and are not run here.

No model service is called when you run it. The embedder is a 133 MB model that akm loads in its own process, and the run is deterministic.

## Run

```
benchmarks/skillret/run --corpus public
benchmarks/skillret/run --corpus private
benchmarks/skillret/run --corpus all
benchmarks/skillret/run --limit 200
```

- `--corpus` picks the library and the queries. `public` is SkillRet's test split. `private` is a library of the same size drawn from its train split: see "The private corpus". `all` runs both and prints them side by side, never as one number.
- `--limit N` runs N queries, drawn at random under seed 42 in proportion to how many skills a query needs. It is never the first N. The library stays whole, so a limited run is as hard per query as the full one, only noisier. It scores keyword search only, so that a check of a setup does not wait for a semantic index: `--limit 200` takes about a minute, 28 s of them to index the skills.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default label is `akm-<version>`.

Each run writes two files to `benchmarks/skillret/results/<UTC date>-<label>/`, or to `private/skillret/results/` for the private corpus:

- `summary.json`: the metrics of the two lines, search on the keyword index and on the semantic one, at 5, 10 and 15, the same for the queries that need one, two and three skills, the number of failed calls and of queries that got no skill, the curate check (see "How akm is used"), the akm version, the search mode akm reported for each index and the embedding model, whether the semantic index was built for the run or kept from an earlier one, the dataset revision and checksums, how the sample was drawn, how long each index and the queries took, and the git commit. A run with `--limit` has the keyword line only.
- `samples.jsonl`: one line per query, in the order of the dataset, with the request, the ids of the skills it needs, the ids that search returned in order on each index, how long each call took and, for the 200 queries of the curate check, the same for curate.

## What it needs

[bun](https://bun.sh), and akm on `PATH` or named in `AKM_BIN`. No model service and no key. The network is used to fetch the data (see "The data"), and once more the first time a run builds a semantic index: akm downloads its embedding model, bge-small-en-v1.5 (133 MB, from the Hugging Face Hub), and the benchmark keeps it in `.cache/models/` at the root of the repository, which git ignores. Every later run reads it from there.

The benchmark gives akm a temporary folder with its own config and folders, writes the 6,006 skills into it, and indexes them with `akm index --full` for keyword search. It never reads or writes your akm bundle. The folder takes about 50 MB for the skills and 80 MB for akm's index, and is removed when the run ends. The semantic index, which embeds every skill, is built the same way in a folder of its own that is kept between runs, in `.cache/akm-index/skillret-public/` (`skillret-private/`), where the next run finds it: see "The semantic index is kept between runs". The public one takes about 310 MB right after a run, 137 MB of which is what akm logged of the run's searches and is deleted when the next run opens the index. A semantic call loads the model in its own akm process, which takes 450 MB of memory, so eight at once take about 4 GB. `private` reads the 188 MB file of train skills whole, which takes about 1.2 GB of memory for ten seconds.

A full run of `public` took 53 minutes the first time: 16 to embed the 6,006 skills for the semantic index, 27 s to index them for keyword search, and 36 for the 9,184 calls, eight at a time (a search on each index for each of the 4,392 queries, and a curate on each index for 200 of them). With the index kept it takes about 37 minutes. That is an estimate: the calls are the same, and a kept index opened in 0.2 s for the retrieval eval's 317 files, but a kept SkillRet index was not timed. `private` takes about 34 minutes the first time and 24 with the index kept, also estimates, from the 10 minutes its semantic index took and the per-call times of its earlier full run. The machine had 12 cores and was busy with other work, with a load average between 10 and 35. A keyword search takes 0.3 s on its own and a semantic one 0.9 s, nearly all of it akm starting up, and for the semantic one loading the model. With eight in flight on that machine a search took 0.9 s on average, a curate 1.5, a semantic search 2.8 and a semantic curate 3.5. A semantic call needs about 1.5 CPU-seconds, so on a busy machine eight at once go no faster than four.

## The data

The data is SkillRet v1.1 at Hugging Face revision `a050ad233a50`, pinned in `assets/ASSETS.lock` with the size, sha256 and line count of each of the six files (the skills, queries and qrels of the test and train splits). The first run fetches what its corpus needs into `assets/` (124 MB for `public`, 262 MB for `private`), checks each file against the lock, and stops if one differs. Later runs use those copies. The files are git-ignored: the dataset is Apache-2.0, but each skill text is scraped from a public GitHub repository and keeps its own licence (MIT or Apache-2.0, named in its record), so it is fetched and never committed or redistributed.

**Which revision.** The Hub's head is a moving target, and SkillRet's own README says an unpinned run is not reproducible. It also moved the test split once. On 2026-07-29, v1.1 filtered the evaluation split: 6,660 skills, 4,997 queries and 8,347 labels became 6,006, 4,392 and 7,187. Nothing was added: v1.1 is v1.0 less 654 skills, 605 queries and their labels. The README and the paper (v3) report their numbers on v1.1, and say that scores on the two versions are not comparable. The paper's 46%, 40% and 13% of queries that need one, two and three skills describe the split before the filter (46.4%, 40.1% and 13.4%). v1.1 has 48.8%, 38.8% and 12.4%.

The Hub head, `6583d7d` on 2026-10-05 and still on 2026-10-06, differs from `a050ad2` in the README's citation (the author order) and in nothing else: all six data files have the same sha256 at both. So the pin could be either, and it is `a050ad2`, the revision SkillRet's README uses in its examples. To check that the pinned files are the ones the published numbers come from, SkillRet's own BM25 baseline (its `eval_bm25` and `trec_eval`, with `bm25s` and `pytrec_eval`) was run on them once. It gives the published BM25 row to the last digit: NDCG 49.31, 51.69 and 52.75, Recall 53.03, 59.41 and 62.92, Completeness 38.21, 44.56 and 47.93.

## How akm is used

For each skill, one file, `skills/<id>/SKILL.md` in the bundle, holding the `skill_md` field as the dataset has it: the front matter and the body. The id is the dataset's, because skill names are not unique (153 names occur more than once in the test pool). akm names a skill by its directory, so with this layout it indexes the skill's id and not its own name. Naming the directories `<name>-<id>` instead moved NDCG@10 by +0.01 for keyword search on a sample of 800 queries, and by -0.09 for semantic search on a sample of 400 (each measured once, not part of the benchmark), so the layout does not hold akm back.

Then, once for each of the two indexes:

```
akm index --full
```

and for each request, as written in the dataset, which is a paragraph or several, on each index:

```
akm search --limit 15 --shape agent --format json -- "<request>"
```

The keyword index is built with semantic search off, which is akm's default, and its search is SQLite FTS5 with BM25 over each skill's name, description, tags and body, with Porter stemming, and the request's words, minus stopwords, joined with OR. The body is a projection of the file without its front matter, comments, fenced code and link targets, cut at 16,384 characters. akm skips a result whose indexed text equals one it has already returned, and no two skills of either library have the same body, so it never hides a needed skill.

The semantic index is built from the same files with `semanticSearchMode: "auto"` and `embedding.localModel` set to `Xenova/bge-small-en-v1.5`, akm's own default model. akm embeds each skill from the same fields, cut at 512 tokens, and embeds a request with the prompt the BGE models are trained with, `Represent this sentence for searching relevant passages: `, which is the prompt the paper gives bge-small. Its semantic search fuses the keyword ranking with the 100 nearest vectors by reciprocal rank, so the semantic lines are a hybrid and not vectors alone. The paper's bge-small-en-v1.5 row (NDCG@10 54.51) is the same model, though it has no akm and no keyword ranking around it, and it reads `name | description | skill_md` where akm reads its own fields.

akm answers with keyword search alone, `searchMode: "fts-fallback"`, a warning in the output and exit code 0, when it cannot embed a request within `embedding.queryTimeoutMs`, 3 seconds unless the config says more. Each akm process loads the model, and 2 calls of 96 missed the 3 seconds with eight at once on a busy machine. The sandbox allows ten minutes, and the benchmark checks every answer anyway: a call whose answer does not say `searchMode` semantic, or keyword on the keyword index, is a failed call. It is made once more, and one that fails twice is counted in `errored`, left out of that line's numbers, and the run exits with 1. The semantic index is built first, and the run stops in its first minutes when it does not hold an embedding of each skill or when one semantic search does not come back as semantic.

One call of each, for 15 results, serves all three cut-offs: the first 5 and the first 10 of a `--limit 15` list are what `--limit 5` and `--limit 10` return (checked on 40 requests, on the keyword index and on the semantic one: 160 comparisons each, no difference).

curate runs the same search and adds a preview to each result. Its reranker is off by default, so it returns the same skills in the same order as search, and the benchmark scores search only. It would return nothing for a request that starts with `<` and contains `</`, which it takes for a harness envelope, and none of SkillRet's requests does. To keep this honest, every run asks `akm curate --limit 15` for 200 of the queries, on each index, and compares the skills it returns, in order, with search's. The 200 are drawn at random under seed 42 from the queries of the run, in the order of the dataset, and a run with fewer queries asks about all of them. `summary.json` records the seed, the ids of the queries, how many curate answered with search's ranking, and which it did not. The console says so, loudly, when there are any: curate is then no longer the same as search, and its lines have to come back into the benchmark by a change to it. In the runs below it answered with search's ranking for all 200, on both indexes.

**Several calls at a time.** A full run is 9,184 calls, each of which starts akm, so eight run at once against each index. A search reads the index and writes only its usage log, which does not feed the ranking, and akm 0.9.26 does not re-index on a read: a result depends on the request and the index alone. The rankings of 96 requests were identical with 1, 4, 8 and 12 calls at a time on the keyword index, and with 1, 4 and 8 on the semantic one, for search and for curate. Semantic calls do not go faster with eight at once than with four, on a machine busy with other work: each takes about 1.5 CPU-seconds, nearly all of it loading the model.

## The semantic index is kept between runs

Embedding the 6,006 skills is most of the first run, so the benchmark keeps the semantic index in `.cache/akm-index/skillret-public/`, and `skillret-private/` for the private corpus, which git ignores. The folder is akm's whole sandbox for that index, with the skills in its bundle, because akm records the paths of what it indexed and indexes everything again when they move. The next run uses the index as it is: it checks that the skills are the ones the index was built from and asks akm what the index holds, which takes a second or two, where building the index took 16 minutes. It is the index that was built, untouched, so a run on it ranks every query as the run that built it did. The retrieval eval, which keeps its indexes the same way, returned the same results in its cold and its warm runs for every query, on every column.

The index is used again only when nothing changed: the same skills with the same text, the same akm, the same embedding model and the same folder. When a skill changed, is gone or is new, the benchmark builds a new index from nothing, and says so. It never updates a kept index, because akm 0.9.26 does not update an index to what a new one is:

- A skill that was changed or removed stays in the row count and the token totals of the keyword index, which is a contentless FTS5 table, so every BM25 score is a little off from then on. The rankings of 400 queries over the 6,006 skills had another top 15 than a new index's for 37 queries after 10 skills were changed, for 25 after 10 were removed, and for 325 after 200 were changed. Skills that were added did not change one of the 400.
- `akm index --full` on an index that exists counts every asset twice, so the benchmark runs it on a new index only.
- The first update of the retrieval eval's public library, an index of 259 assets, gave 15 to 17 of them new ids and new embeddings though no file had changed, and most of its queries then ranked otherwise: 89 of 136 in one run, 37 of 60 in another. In the retrieval eval's books, an index of 93 assets, an update embedded only the file that was changed or new.

Before it uses a kept index, the benchmark asks akm what the index holds (`akm info`): the number of assets and the time it was built must be those that the build recorded, and it must hold embeddings. When it does not, the run says so, builds a new index, and `summary.json` has `"semantic_index": "rebuilt"`. It is `"warm"` for an index that was kept and `"cold"` for one that was built because none was kept. What akm logged of the earlier run's searches is deleted first, so every run starts with no search history. One run uses an index at a time: a second run stops and says which file to remove if no run is using it.

akm lists the files of a bundle that is inside a git repository with `git ls-files`, which leaves out what the repository ignores, and the repository ignores `.cache/`. An index there would hold no skill, so the benchmark has git stop looking for a repository at the index's folder, and akm walks the bundle itself. To start over, delete `.cache/akm-index/`.

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

akm 0.9.26, full runs of 2026-10-06 at the pinned revision. The two akm lines are search on the keyword index and on the semantic one. curate returned search's ranking on the 200 queries it was checked on, and is not scored. Rows marked published are SkillRet's numbers (Table 3 of its paper) for other retrievers, which are theirs and are not run here. The paper has no MAP, so the BM25 cells in italics come from running SkillRet's BM25 code here. Everywhere in this README, "run here" means SkillRet's own `eval_bm25` and `trec_eval` (bm25s 0.3.12 and pytrec-eval-terrier 0.5.10) run once on the pinned files. They are not part of this repository.

**Public: the test split, 6,006 skills and 4,392 queries.**

| | NDCG@5 | NDCG@10 | NDCG@15 | Recall@5 | Recall@10 | Recall@15 | Completeness@5 | Completeness@10 | Completeness@15 | MAP@5 | MAP@10 | MAP@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| akm search | 47.95 | 50.47 | 51.70 | 51.50 | 58.38 | 62.42 | 36.43 | 43.21 | 47.31 | 42.24 | 43.44 | 43.87 |
| akm search, semantic | 55.43 | 58.00 | 59.23 | 59.28 | 66.18 | 70.20 | 43.53 | 50.64 | 55.03 | 49.39 | 50.65 | 51.11 |
| BM25, published | 49.31 | 51.69 | 52.75 | 53.03 | 59.41 | 62.92 | 38.21 | 44.56 | 47.93 | *43.58* | *44.74* | *45.10* |
| bge-small-en-v1.5 (33M), published | 52.57 | 54.51 | 55.45 | 54.73 | 60.01 | 63.07 | 38.96 | 43.97 | 47.11 | - | - | - |
| bge-large-en-v1.5 (335M), published | 57.04 | 59.00 | 59.80 | 59.19 | 64.37 | 66.95 | 42.96 | 48.34 | 50.80 | - | - | - |
| Qwen3-Embedding-8B, published | 61.35 | 63.64 | 64.73 | 64.24 | 70.29 | 73.76 | 47.43 | 54.14 | 58.15 | - | - | - |
| SKILLRET-Embedding-8B (their fine-tune), published | 84.58 | 86.44 | 86.95 | 88.55 | 93.25 | 94.84 | 80.35 | 88.11 | 90.80 | - | - | - |

By how many skills a query needs, at 10. The BM25 row is SkillRet's code run here. The last two are from Table 5 of the paper, which reports them for the 0.6B models only.

| | NDCG@10, 1 skill (2,143) | NDCG@10, 2 skills (1,703) | NDCG@10, 3 skills (546) | Completeness@10, 1 | Completeness@10, 2 | Completeness@10, 3 |
|---|---|---|---|---|---|---|
| akm search | 55.42 | 47.16 | 41.33 | 68.27 | 23.84 | 5.31 |
| akm search, semantic | 64.52 | 53.91 | 45.16 | 77.41 | 31.12 | 6.41 |
| BM25, run here | 57.74 | 47.77 | 40.13 | 70.51 | 24.49 | 5.31 |
| Qwen3-Embedding-0.6B, published | 74.0 | 53.6 | 40.6 | 83.8 | 25.8 | 1.8 |
| SKILLRET-Embedding-0.6B, published | 84.2 | 79.6 | 73.7 | 92.1 | 74.2 | 42.1 |

- akm's keyword search lands just under BM25: NDCG@10 is 50.47 against 51.69, Recall@10 58.38 against 59.41, Completeness@10 43.21 against 44.56. On the same queries akm is 1.22 points of NDCG@10 below BM25, with a 95% interval of 0.71 either way, so the gap is real and small.
- The semantic search adds 7.5 points of NDCG@10 to it: 58.00 against 50.47, with a 95% interval of 0.7 on the same queries. Recall@10 goes from 58.38 to 66.18 and Completeness@10 from 43.21 to 50.64. 635 of the 4,392 queries (14%) get none of their skills in the first 15, against 964 (22%) with keywords.
- bge-small-en-v1.5 is the model of the semantic search. The paper's row for it, 54.51, is the model alone, and akm's 58.00 is 3.5 points above it: akm fuses the keyword ranking with the vectors. It is a point under bge-large-en-v1.5 (59.00), which has ten times the parameters, 5.6 under Qwen3-Embedding-8B (63.64), and 28 under the model SkillRet fine-tuned (86.44). The two read different text, so these are a guide and not a controlled comparison.
- A query that needs more skills is harder with either search. With semantic search Completeness@10 is 77% when a query needs one skill, 31% for two and 6% for three, against 68%, 24% and 5% with keywords: the vectors help less as a query needs more skills.
- On the 200 queries of the curate check, curate returned search's ranking, on both indexes, and every run checks it. No call failed, every call said it searched as it was asked to, and every query got 15 skills.
- The run is deterministic. Query by query, the keyword and the semantic line of this run are those of the earlier full run of the same day, whose semantic index was in a temporary folder on another filesystem: all 4,392 rankings are the same on both lines. The keyword lines are also, to the last digit, those of two earlier full runs with keyword search alone, and the semantic search ranked 96 queries the same, in the same order, from two independent builds of its index, and with one, four and eight calls at a time.
- A mean over all 4,392 queries has a 95% interval of about 1.1 points of NDCG@10, since the standard deviation of a query's NDCG@10 is 0.36 to 0.38. A sample of 200 has about 5 points. Use `--limit` to check that a setup runs, or to catch a large change, and not to compare two akm versions.
- What each retriever reads differs, so the rows are not a like-for-like comparison of ranking methods. bm25s indexes the name, the description and the whole SKILL.md. bge-small and bge-large read the first 512 tokens of that, Qwen3-Embedding-8B up to 32,768. akm's keyword index holds a projection of the body cut at 16,384 characters, and its embedder reads the first 512 tokens of the name (here the skill's id), the description, the tags and that projection.

**Private: a library from the train split, 6,006 skills and 4,392 queries.** The BM25 rows are SkillRet's BM25 code run here on the same library and queries, to compare akm with something that has seen neither. The semantic search has no such control: SkillRet's own bge-small run was not repeated on this library. These rows are from the full run of 2026-10-06 that also scored curate, which returned search's ranking for every query on both indexes, and whose semantic index was in a temporary folder.

| | NDCG@5 | NDCG@10 | NDCG@15 | Recall@5 | Recall@10 | Recall@15 | Completeness@5 | Completeness@10 | Completeness@15 | MAP@5 | MAP@10 | MAP@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| private, akm search | 70.96 | 72.35 | 73.00 | 70.38 | 74.06 | 76.13 | 51.07 | 55.17 | 57.65 | 64.97 | 65.71 | 65.96 |
| private, akm search, semantic | 66.80 | 68.54 | 69.48 | 67.64 | 72.36 | 75.50 | 49.00 | 53.80 | 57.26 | 60.59 | 61.44 | 61.78 |
| private, BM25, run here | 71.70 | 72.89 | 73.47 | 71.22 | 74.35 | 76.22 | 51.73 | 55.31 | 57.67 | 65.62 | 66.26 | 66.49 |
| public, akm search, for comparison | 47.95 | 50.47 | 51.70 | 51.50 | 58.38 | 62.42 | 36.43 | 43.21 | 47.31 | 42.24 | 43.44 | 43.87 |
| public, akm search, semantic, for comparison | 55.43 | 58.00 | 59.23 | 59.28 | 66.18 | 70.20 | 43.53 | 50.64 | 55.03 | 49.39 | 50.65 | 51.11 |
| public, BM25, published, for comparison | 49.31 | 51.69 | 52.75 | 53.03 | 59.41 | 62.92 | 38.21 | 44.56 | 47.93 | *43.58* | *44.74* | *45.10* |

| private | NDCG@10, 1 skill (2,143) | NDCG@10, 2 skills (1,703) | NDCG@10, 3 skills (546) | Completeness@10, 1 | Completeness@10, 2 | Completeness@10, 3 |
|---|---|---|---|---|---|---|
| akm search | 84.11 | 63.92 | 52.54 | 90.67 | 27.13 | 3.30 |
| akm search, semantic | 79.22 | 60.93 | 50.31 | 88.43 | 26.13 | 4.21 |
| BM25, run here | 85.29 | 63.68 | 52.96 | 91.51 | 26.37 | 3.48 |

- akm's keyword search scores 22 points higher on the private queries than on the public ones (NDCG@10 72.35 against 50.47), and BM25 gains as much (72.89 against 51.69). So the gap comes from the data and not from akm: the private queries are shorter and, the paper says, easier for keyword matching.
- akm's keyword search is 0.54 points of NDCG@10 below BM25 on the private queries, with a 95% interval of 0.57 either way, against 1.22 below on the public split. A ranking tuned to the public items would stand better against BM25 there than here, and akm stands slightly worse there.
- The semantic search does the opposite of what it does on the public split. Its NDCG@10 is 68.54 against 72.35 with keywords, 3.8 points lower with a 95% interval of 0.7 on the same queries, where it was 7.5 points higher on the public queries. NDCG is lower at 5, 10 and 15 (by 4.2, 3.8 and 3.5), and for the queries that need one, two and three skills. Recall and Completeness are lower at 5 and 10 and the same within noise at 15. Keyword search is already strong on these queries, and fusing in the vectors of a small model costs more than it adds. The difference does not depend on the length of a query, in either corpus. So what the vectors add depends on the queries, and a gap between the public and the private numbers of the semantic lines is not a sign of tuning either.
- 6% of the private queries (261) get none of their skills in the first 15 with semantic search, against 5% (225) with keywords. On the public split it is 14% against 22%.
- As on the public split, search and curate return the same skills for every query on both indexes, no call failed, every call said it searched as it was asked to, and every query got 15 skills.

## Licence

The code is MPL-2.0, like the rest of this repository. The dataset is not part of it and is not redistributed. See `../../NOTICE` for SkillRet's credit and licences. akm's embedding model is bge-small-en-v1.5 by BAAI, licensed MIT, in the ONNX form that Xenova publishes. A run downloads it when it needs it, and it is not part of this repository either.
