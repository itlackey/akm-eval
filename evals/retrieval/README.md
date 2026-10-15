# retrieval

Does akm search put the assets an agent needs at the top?

The eval indexes a library in an akm sandbox, asks `akm search` and `akm curate` for the first 10 results of each query, and scores them against graded judgments of which assets answer the query. It does this with akm's keyword search and, in a full run, with its semantic search too. Two public collections, each scored on its own:

- `library`: 111 task queries and 25 non-task inputs over the library in `corpus/library`.
- `books`: 51 task queries over 93 assets on cooking, law and tax, and first aid, with judgments that also name assets that must never outrank a relevant one.

It calls no model. Semantic search uses akm's built-in embedding model, bge-small-en-v1.5, which akm downloads once into `.cache/` (133 MB). The semantic index is kept in `.cache/akm-index/` and reused until akm or a file of the library changes; delete that folder to start over.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/retrieval/run                          # public: the library and the books
evals/retrieval/run --corpus custom          # the rewrite in private/retrieval/assets (./generate-assets --only retrieval)
evals/retrieval/run --cases ~/notes/retrieval
evals/retrieval/run --limit 20               # a quick check, keyword search only
```

- `--semantic on|off|auto`: whether semantic search is scored. `auto` (default) scores it in a full run of the public or rewrite corpus, not with `--limit` or `--cases`. On a large library of your own, `on` embeds every asset, which can take most of an hour the first time.
- `--repeat N`, `--akm COMMAND`, `--label NAME` as for every eval. `-y` is accepted and not needed.

Results go to `evals/retrieval/results/<UTC date>-<label>-<collection>/` (`private/retrieval/results/` for a custom corpus). The default label is `akm-<version>`. A full public run takes about 6 minutes.

## Run your own set

`--cases DIR` runs a labelled set of yours. The folder holds:

- `queries.jsonl` and `qrels.jsonl`, in the format of `assets/README.md`. A query whose `kind` is `nontask` (or `chitchat`, `notification`, `log`, `status`) should get no result; every other query needs grades.
- `library/`: the folder akm indexes, or a link to it. The refs in `qrels.jsonl` are the refs `akm search` prints for it.
- `bundles.json`, only when `library/` is a folder of bundles: `{ "notes": "akm", "site": "website-snapshot" }`, each bundle's folder and adapter. Each bundle is indexed in place, read only, and its refs are `<folder>//<path>`.

## How a query is scored

Each judgment grades an asset 0 to 3 for a query: 3 is exactly the asset to load, 2 relevant and useful, 1 same topic but no help, 0 unrelated. Grade 2 or 3 is relevant. A task query with no relevant asset is not scored, and is counted with the abstentions. A result naming a section (`ref#section`) counts as the asset.

Metrics, for each of four columns (`search` and `curate` on the keyword index, `semantic_search` and `semantic_curate`):

| Metric | Meaning |
|---|---|
| `ndcg_10` | nDCG over the first 10 results; a result nobody graded counts as not relevant |
| `ndcg_10_condensed` | nDCG over the graded results alone; shows sensitivity to unjudged results, not a bound on the true score |
| `judged_10` | the share of the first 10 results someone graded. Not a quality score |
| `p_5`, `success_5` | the share of the first 5 places that are relevant; the share of queries with a relevant asset in the first 5 |
| `mrr`, `recall_10` | one over the rank of the first relevant asset; the share of relevant assets in the first 10 |
| `banned_above`, `banned_above_first` | books only: the share of queries where a banned asset ranks above the last, or the first, relevant one. Lower is better |

`abstention.non_task` counts the non-task inputs that got no result, per column. A failed call is counted in `errored` and left out; one killed at its 120-second limit also in `timeouts`. A failed semantic call makes the run `aborted`.

The judgments cover what akm 0.9.26's keyword search and a plain BM25 returned, so semantic search and any change that surfaces new assets score lower on `ndcg_10` until those results are graded. When `judged_10` falls, grade the new results with `label --from` (below) and score the run again with `scripts/rescore`. Review `judged_10` alongside ranking quality; incomplete relevance judgments can bias comparisons. After updating labels, explicitly rescore both saved runs before comparing them.

## What the summary reports

`summary.json`, per collection: `metrics` for each column, `abstention`, `errored`, `timeouts`, the search mode akm reported, `semantic_index` (`cold`, `warm` or `rebuilt`) and which akm built it, `assets_sha256` over the library, bundle mapping, queries and qrels (`assets` holds the four), the akm `config`, `seed` (of a rewrite), and the `manifest`. `wall_seconds` includes collection setup, indexing and queries,
for both single and repeated runs. `samples.jsonl` has one row per query with every call's results, grades, time and error.

## Grade results: label

```
evals/retrieval/label                        # grade the pool of each task query that has no grade yet
evals/retrieval/label --from evals/retrieval/results/<UTC date>-<label>-library
evals/retrieval/label --cases ~/notes/retrieval
```

`label` pools the top 10 of `akm search`, `akm curate` and a plain BM25 for each task query, with the assets the author expected, asks a judge model to grade each unjudged pair 0 to 3, and appends the grade to `assets/qrels.jsonl` with the judge, a digest of the prompt, the date and a digest of the asset. Stop and rerun it at will; a pair whose asset changed is graded again. `--from RESULTS_DIR` pools a run's results instead, semantic columns included. `--cases DIR` grades your own set (no BM25), says which judge gets your notes and asks first. The judge is `--judge-model ID` or `JUDGE_MODEL`, at `JUDGE_BASE_URL`. Use one judge for a set: `label` and `run` warn when the qrels mix judges. The library's original grades are stamped judge `legacy`. The [2026-10-15 expansion](assets/judgment-expansion-20261015.md) fills the missing top-ten task-query pairs from saved keyword/semantic runs in both public collections; it uses explicit Codex review, preserves existing judgments, and does not run the collector or a judge endpoint.

## Domain mix

The public library has 251 assets and 1,876 judgment rows (1,846 query/asset identities after alias normalization), by top-level group:

| Group | Assets | Graded rows | Share of rows | Relevant rows |
|---|---:|---:|---:|---:|
| ai-skills | 87 | 601 | 32.6% | 173 |
| print | 45 | 494 | 26.8% | 180 |
| coding | 60 | 271 | 14.7% | 89 |
| e2e-testing | 13 | 159 | 8.6% | 44 |
| administrative | 20 | 131 | 7.1% | 45 |
| dev-workflow | 5 | 53 | 2.9% | 9 |
| reports | 5 | 43 | 2.3% | 14 |
| gws-setup | 6 | 33 | 1.8% | 7 |
| notify | 3 | 16 | 0.9% | 6 |
| writing | 3 | 16 | 0.9% | 7 |
| akm-migrate | 1 | 10 | 0.5% | 1 |
| cmyk-image-converter | 1 | 8 | 0.4% | 4 |
| development | 1 | 8 | 0.4% | 2 |
| other | 1 | 3 | 0.2% | 2 |
| all | 251 | 1846 | 100.0% | 583 |

`bun evals/retrieval/src/mix.ts` prints it, and a test fails when this one differs. Two groups hold 59% of the rows, so a score here says how akm ranks a library of a few tool and print domains. Check a change on the books and on a set of your own before calling it general.

## Licence

MPL-2.0. `../../NOTICE` credits the three public books the books' assets cover.
