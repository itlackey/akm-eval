# retrieval

Does akm search put the assets an agent needs at the top?

akm indexes a library of assets: skills, knowledge notes, commands, agents, workflows and scripts. An agent finds them with `akm search`, or asks `akm curate` for a short list for its task. This eval gives akm 111 task queries and 25 non-task inputs over the public library. It scores the first 10 results of both commands against graded judgments of which assets answer each query.

No model runs when you run the eval. A judge model graded the assets once, to make `assets/qrels.jsonl`. See "Make or extend the judgments" below.

## Run

```
evals/retrieval/run --corpus public
evals/retrieval/run --corpus private
evals/retrieval/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N queries, in the task and non-task proportion of the whole set. Use it to check a setup.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is `akm-<version>`.

The private run reads `private/retrieval/assets/`. Make it first with `./generate-assets --only retrieval`. The run stops with an error when it is missing.

Each run writes two files to `evals/retrieval/results/<UTC date>-<label>/`, or to `private/retrieval/results/` for the private corpus:

- `summary.json`: the metrics, how many queries were scored, the akm version, the search mode, the corpus and the git commit.
- `samples.jsonl`: one line per query, with what search and curate returned, the grade of each result, the scores and how long each call took.

## What it needs

[bun](https://bun.sh), and akm on `PATH` or named in `AKM_BIN`. Nothing else: no model, no key, no network.

The eval copies the library into a temporary folder, gives akm its own config and folders there, and indexes it. It never reads or writes your akm bundle. Then it makes two calls per query, which takes about a minute for all 136.

Search is keyword search. The sandbox config turns semantic search off, which is also akm 0.9.26's default (`semanticSearchMode: "off"`), so there is no embedding model to download. The `akm setup` wizard pre-selects semantic search, which downloads an embedding model. This eval does not score it. The summary records the search mode akm reports for the calls.

## What it asks akm

For each query: `akm search --limit 10` and `akm curate --limit 10`. curate returns 4 by default. The eval asks for 10, so both commands are scored on the same cut-offs.

A result that names a section of an asset (`ref#section`) counts as the asset, at its first place. The assets that a curate hit links to (`supportRefs`) are not results and are not counted.

curate runs one search and attaches a preview and run details to each hit. A reranker can reorder its candidates first, but it is off by default and the eval leaves it off. So curate returns the same assets in the same order as search. It differs in one way: it abstains on input that is a harness envelope, such as `<task-notification>...</task-notification>`.

## Read the results

A task query is scored when at least one asset has grade 2 or 3 for it ("relevant"). The scores are means over those queries. A task query with no relevant asset is not scored. It is counted, and reported with the abstentions.

| Metric | Meaning |
|---|---|
| `ndcg_10` | nDCG over the first 10 results. An asset of grade g gains 2^g - 1, discounted by log2 of its rank + 1, against the best order of everything graded for the query. |
| `p_5` | The share of the first 5 places that hold a relevant asset. Fewer than 5 results leave places empty. |
| `success_5` | The share of queries with a relevant asset in the first 5. |
| `mrr` | One over the rank of the first relevant asset, within the first 10. 0 when there is none. |
| `recall_10` | The share of the query's relevant assets that are in the first 10. |
| `judged_10` | The share of the results among the first 10 that someone graded for the query. This is not a quality score. See "Notes". |

Non-task inputs are chit-chat, notifications, log lines and status updates, where the right result is nothing. `abstention.non_task` is how many of them got no result from akm at all, for each command. `abstention.no_answer` is the same count for the task queries that have no relevant asset.

A call that fails, such as a timeout, is counted in `errored` and left out of that command's numbers.

## Assets

- `assets/queries.jsonl`: 111 task queries and 25 non-task inputs. Each has an id, the query and a kind. A task query also has the assets the author expected to answer it.
- `assets/qrels.jsonl`: the grade, 0 to 3, of each asset a judge model was shown for each task query.
- `assets/spotcheck.jsonl`: 40 random pairs from the qrels that the author graded without seeing the judge's grade, next to the judge's.
- `assets/README.md`: how the queries were written, the mix of kinds, how the judgments were made, the judge model, the date and how well the judge agrees with a person. The assets carry a canary string: do not train on them.
- `private/retrieval/assets/`: `library/`, `queries.jsonl` and `qrels.jsonl`, the same set with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. One rewrite run covers the library, the queries and the judgments, so a name changes the same way in all of them, and every grade is kept. akm and the other tools are renamed in the files, in the file names, in the queries and in the refs: 90 of the 259 refs change. About 4% of the words change: 3.5% of the library's and 4.1% of the queries', counting runs of letters and digits. The mapping is `private/retrieval/map.json`. They are made by `generate` and never published. `generate` also checks them: every ref in the qrels and every expected asset must name an asset akm indexes in the private library, and every task query must keep its relevant assets.

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

- Unjudged results count as not relevant. The judgments cover what akm 0.9.26 and a plain BM25 returned in their top 10, and what the author expected. A run on another akm version can return assets nobody graded. `judged_10` shows how large a share of the results that is. When it falls, run `label` before you compare.
- The judge reads the first 16,000 characters of an asset. The 15 assets that are longer are cut there, and an answer past the cut is not seen.
- Compare results only between runs with the same akm version, search mode and judgments.
- A much better public score than private score would point to akm having been tuned to the public names, tool names or numbers. The private copy changes about 4% of the words: see above, and `private/retrieval/map.json` for every name it renamed. Renamed words also change the keyword statistics a little, so a few results in places 4 to 10 differ between a public and a private run, and `judged_10` can read slightly under 100% in the private run.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
