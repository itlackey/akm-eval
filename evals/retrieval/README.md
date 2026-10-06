# retrieval

Does akm search put the assets an agent needs at the top?

akm indexes a library of assets: skills, knowledge notes, commands, agents, workflows and scripts. An agent finds them with `akm search`, or asks `akm curate` for a short list for its task. This eval gives akm queries over two public collections. It scores the first 10 results of both commands against graded judgments of which assets answer each query, with akm's keyword search and with its semantic search.

- `library`: 111 task queries and 25 non-task inputs over the public library in `corpus/library`.
- `books`: 51 task queries over 93 assets in three domains: cooking, law and tax, and anatomy and first aid. The judgments come from an earlier experiment. Besides grades, they name assets that must never outrank a relevant one, such as an asset that holds an out-of-date figure.

Each collection is scored on its own, never pooled with another. A third corpus, `own`, runs a labelled set of yours.

No model service is called when you run the eval. The semantic search is a small embedding model that akm runs inside its own process. A judge model graded the library's assets once, to make `assets/qrels.jsonl`. The books' judgments were made by hand for the earlier experiment. See "Make or extend the judgments" below.

## Run

```
evals/retrieval/run --corpus public
evals/retrieval/run --corpus private
evals/retrieval/run --corpus own
evals/retrieval/run --corpus all
```

- `--corpus` picks the assets. `public` runs the library and the books, each on its own, and prints them side by side. `private` runs their private copies. `own` runs your own set: see "Run your own set". `all` runs public and private, and prints the public and the private result of each collection side by side, never as one number.
- `--limit N` runs N queries of each collection, in the task and non-task proportion of its whole set. Use it to check a setup.
- `--label NAME` names the results folders, `<UTC date>-<label>-<collection>`. The default label is `akm-<version>`.

The private run reads `private/retrieval/assets/`. Make it first with `./generate-assets --only retrieval`. The run stops with an error when it is missing. The own run reads `private/retrieval/own/`, and stops with an error that says how to make a set when the folder holds none.

Each run writes two files for each collection to `evals/retrieval/results/<UTC date>-<label>-<collection>/` (the collection is `library` or `books`), or to `private/retrieval/results/` for the private corpus and for `own`:

- `summary.json`: the metrics of the four columns, how many queries were scored, the akm version, the search mode akm reported for each index, the embedding model, how long each index took to build, the corpus, the collection and the git commit.
- `samples.jsonl`: one line per query, with what search and curate returned on each index, the grade of each result, the scores and how long each call took.

## What it needs

[bun](https://bun.sh), and akm on `PATH` or named in `AKM_BIN`. No model service and no key. The network is used once, the first time a run builds a semantic index: akm downloads its embedding model, bge-small-en-v1.5 (133 MB, from the Hugging Face Hub), and the eval keeps it in `.cache/models/` at the root of the repository, which git ignores. Every later run, and every sandbox, reads it from there.

The eval copies the library into two temporary folders, gives akm its own config and folders in each, and indexes it: once for keyword search, and once with the embedder, which embeds every asset. It never reads or writes your akm bundle. Then it makes four calls per query: search and curate, each on both indexes. akm 0.9.26 on a busy 12-core machine took 22 s to build the semantic index of the library's 259 assets and 14 s for the books' 93, about eight assets a second. The library's 136 queries took 5.5 minutes in all and the books' 51 took 3, against a minute and half a minute with keyword search alone: a keyword call takes 0.3 to 0.5 s, and a semantic one 0.8 to 1.2 s, because each akm process loads the model. A library of several bundles (see "Run your own set") is not copied: akm indexes each bundle where it is, read only, and the semantic index embeds every asset of it, at about eight a second. A set of 24,000 assets took 52 minutes to embed, and the whole run 68 minutes, against five with keyword search alone.

Keyword search is akm 0.9.26's default: the sandbox config has `semanticSearchMode: "off"`. The semantic index is built with `semanticSearchMode: "auto"` and `embedding.localModel` set to bge-small-en-v1.5, which is also akm's own default model. Semantic search in akm fuses its keyword ranking with the nearest vectors by reciprocal rank, so it is not vectors alone. akm answers a query with keyword search alone, `searchMode: "fts-fallback"`, when it cannot embed it in time (3 seconds by default, which 2 calls of 96 missed at eight at once on a busy machine). The sandbox allows ten minutes, and the eval still takes any answer that does not say `semantic` for a failed call. It also stops before the first query if the index does not hold an embedding of every asset, or if one semantic search does not come back as semantic.

## What it asks akm

For each query: `akm search --limit 10` and `akm curate --limit 10`, on the keyword index and on the semantic one. curate returns 4 by default. The eval asks for 10, so both commands are scored on the same cut-offs.

A result that names a section of an asset (`ref#section`) counts as the asset, at its first place. The assets that a curate hit links to (`supportRefs`) are not results and are not counted.

curate runs one search and attaches a preview and run details to each hit. A reranker can reorder its candidates first, but it is off by default and the eval leaves it off. So curate returns the same assets in the same order as search, on either index. It differs in one way: it abstains on input that is a harness envelope, such as `<task-notification>...</task-notification>`.

## Read the results

Each metric is given for four columns: `search` and `curate` on the keyword index, and `semantic_search` and `semantic_curate` on the semantic one. A task query is scored when at least one asset has grade 2 or 3 for it ("relevant"). The scores are means over those queries. A task query with no relevant asset is not scored. It is counted, and reported with the abstentions.

| Metric | Meaning |
|---|---|
| `ndcg_10` | nDCG over the first 10 results. An asset of grade g gains 2^g - 1, discounted by log2 of its rank + 1, against the best order of everything graded for the query. |
| `p_5` | The share of the first 5 places that hold a relevant asset. Fewer than 5 results leave places empty. |
| `success_5` | The share of queries with a relevant asset in the first 5. |
| `mrr` | One over the rank of the first relevant asset, within the first 10. 0 when there is none. |
| `recall_10` | The share of the query's relevant assets that are in the first 10. |
| `judged_10` | The share of the results among the first 10 that someone graded for the query. This is not a quality score. See "Notes". |
| `banned_above` | Only where the qrels ban assets, as the books' do. The share of those queries in which a banned asset is among the first 10 and ranks above a relevant one. A relevant asset that is not among the first 10 ranks below every result, so any banned asset that is returned ranks above it. Lower is better. |

Non-task inputs are chit-chat, notifications, log lines and status updates, where the right result is nothing. `abstention.non_task` is how many of them got no result from akm at all, for each column. `abstention.no_answer` is the same count for the task queries that have no relevant asset. A semantic search always has nearest vectors to return, so only a command that abstains by rule, curate on a harness envelope, can return nothing on the semantic index.

A call that fails, such as a timeout, or a semantic call that akm answered with keyword search, is counted in `errored` and left out of that column's numbers. The run exits with 1 when a semantic call failed.

## Assets

- `assets/queries.jsonl`: 111 task queries and 25 non-task inputs. Each has an id, the query and a kind. A task query also has the assets the author expected to answer it.
- `assets/qrels.jsonl`: the grade, 0 to 3, of each asset a judge model was shown for each task query.
- `assets/spotcheck.jsonl`: 40 random pairs from the qrels that the author graded without seeing the judge's grade, next to the judge's.
- `assets/books/`: `library/`, the 93 assets, `queries.jsonl`, 51 task queries, and `qrels.jsonl`, 179 judgments: 80 relevant assets, graded 3 or 2, and 99 banned ones, grade 0. They come from the earlier experiment E6, which built them over three public books. The books themselves are not used. The three licences and the attribution are in `../../NOTICE`.
- `assets/README.md`: how the queries were written, the mix of kinds, how the judgments were made, the judge model, the date and how well the judge agrees with a person, how the books' judgments were turned into grades, and the format of a set of your own. The assets carry a canary string: do not train on them.
- `private/retrieval/assets/`: `library/`, `queries.jsonl` and `qrels.jsonl`, the same set with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. One rewrite run covers the library, the queries and the judgments, so a name changes the same way in all of them, and every grade is kept. akm and the other tools are renamed in the files, in the file names, in the queries and in the refs: 90 of the 259 refs change. About 4% of the words change: 3.5% of the library's and 4.1% of the queries', counting runs of letters and digits. The mapping is `private/retrieval/map.json`. They are made by `generate` and never published. `generate` also checks them: every ref in the qrels and every expected asset must name an asset akm indexes in the private library, and every task query must keep its relevant assets.
- `private/retrieval/assets/books/`: the same three for the books, made by the same `generate` run in a rewrite of their own, with the mapping in `private/retrieval/books-map.json`. The assets name few tools or people, so little changes: 3 words and 40 numbers, 0.65% of the words of the library, and none of the queries.
- `private/retrieval/own/`: your own set. See below.

## Run your own set

```
evals/retrieval/run --corpus own
```

Put a labelled set of your own in `private/retrieval/own/` and run it like the others. It is scored with the same metrics, and its results go to `private/retrieval/results/`. Nothing in `own/` is published. The folder holds:

- `queries.jsonl` and `qrels.jsonl`, in the format that `assets/README.md` describes. A query whose `kind` is `nontask` (or `chitchat`, `notification`, `log` or `status`) is an input whose right result is nothing. Every other query needs grades in `qrels.jsonl`.
- `library/`: the folder akm should index, or a link to it. It is copied into the sandbox as one bundle, so the refs in `qrels.jsonl` are the refs `akm search` prints for it.
- `bundles.json`, only when `library/` is a folder of bundles: it names each bundle's folder and the akm adapter that reads it, such as `{ "notes": "akm", "site": "website-snapshot" }`. Each bundle is indexed where it is, read only, and nothing is copied, so a link to a large frozen snapshot works. akm prints their refs as `<folder>//<path>`, so the qrels use those. Name the adapter of each bundle: when akm picks one itself it can pick another than the one you mean, and index other assets.

The run stops with an error that says this when the folder holds no set in this format.

## Make or extend the judgments

```
evals/retrieval/label
evals/retrieval/label --limit 5
```

For each task query, `label` pools the top 10 of `akm search`, the top 10 of `akm curate`, the top 10 of a plain BM25 over the library files, and the assets the author expected. It asks a judge model to grade each pooled asset 0 to 3 that has no grade yet, and appends the grade to `assets/qrels.jsonl` as it arrives. Stop it at any time and run it again: a graded pair is never graded again.

Set `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL` in `.env`, for any OpenAI-compatible chat endpoint. It sends two requests at a time. `--limit N` labels only the first N task queries.

The request is made for a local server such as llama.cpp: temperature 0, room for 2000 tokens, every spelling of "no visible thinking", and a JSON schema for the reply. If the server refuses the schema, the request is sent again without it. A cloud endpoint can answer 400 to the thinking switches, and a gateway that routes between providers can put the others on cooldown for it: run such an endpoint through a local gateway. When the server answers 429 with `Retry-After`, every request waits that long. A reply with no grade in it is asked for once more. A pair that still has no grade, or that fails, is not written, and the next run tries it again. After 10 failures in a row the run stops and says why. Use one judge for all the grades of a set. `label` reads only the public library and queries, so nothing private goes to the judge: the private grades are the public ones, carried over by `generate`.

The prompt is `umbrela-akm-v1`, from our lab's earlier retrieval harness: one asset at a time, with its type, ref, name, description and the first 16,000 characters of its text (the harness read 1,500, which is too little for this library: most assets are longer). That is up to about 5,000 tokens, and 244 of the 259 assets fit whole. Grading all 1,521 pairs took 78 minutes on one local GPU. Grade 3 is exactly the asset an agent should load. 2 is relevant and clearly useful, though not the best. 1 is the same topic but would not help with this query. 0 is unrelated.

Run it again after a change to the library or to akm. The pool takes in the new top 10, and only the pairs that are new get a grade.

## Notes

- Unjudged results count as not relevant. The library's judgments cover what akm 0.9.26's keyword search and a plain BM25 returned in their top 10, and what the author expected. A run on another akm version can return assets nobody graded, and so does the semantic search: 71% of its top 10 on the library was judged, against 100% for keyword search. Its library scores are therefore lower bounds, and the keyword and semantic columns are not on equal terms there until the semantic results are graded too. `judged_10` shows how large a share of the results is unjudged. When it falls, run `label` before you compare. `label` pools the keyword results only.
- The books' judgments name only the relevant assets and the banned ones of each query. Every other asset counts as not relevant, though some may answer a query, and `judged_10` reads about a quarter. They are goldens, not a pooled test collection. `label` does not touch them.
- The judge reads the first 16,000 characters of an asset. The 15 assets that are longer are cut there, and an answer past the cut is not seen.
- Compare results only between runs with the same akm version, embedding model and judgments.
- A much better public score than private score would point to akm having been tuned to the public names, tool names or numbers. The library's private copy changes about 4% of the words: see above, and `private/retrieval/map.json` for every name it renamed. Renamed words also change the keyword statistics a little, so a few results in places 4 to 10 differ between a public and a private run, and `judged_10` can read slightly under 100% in the private run. The books' private copy changes under 1% of the words, so it tests this much less: with akm 0.9.26 it scores exactly like the public books.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`. The books' assets are covered too, and `../../NOTICE` credits three public books whose subjects they cover.
