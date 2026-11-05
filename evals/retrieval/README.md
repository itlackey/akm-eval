# retrieval

Does akm search put the assets an agent needs at the top?

The eval indexes a library in an akm sandbox, asks `akm search` and `akm curate` for the first 10 results of each query, and scores them against graded judgments of which assets answer the query. It does this with akm's keyword search and, with `--semantic`, with its semantic search too. Two public collections, each scored on its own:

- `library`: 111 task queries and 25 non-task inputs over the library in `corpus/library`.
- `books`: 51 task queries over 93 assets on cooking, law and tax, and first aid, with judgments that also name assets that must never outrank a relevant one.

It calls no model. Semantic search uses akm's built-in embedding model, bge-small-en-v1.5, which akm downloads once into `.cache/` (133 MB). The semantic index is kept in `.cache/akm-index/` and reused until akm or a file of the library changes; delete that folder to start over.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/retrieval/run                          # public: the library and the books, keyword search
evals/retrieval/run --semantic               # the same, with semantic search scored too
evals/retrieval/run --corpus custom          # the rewrite in private/retrieval/assets (./generate-assets --only retrieval)
evals/retrieval/run --cases ~/notes/retrieval
evals/retrieval/run --limit 20               # a quick check, keyword search only
evals/retrieval/run --limit 20 --semantic    # 20 queries of each collection, both searches
```

- `--semantic`: also score akm's semantic search; without it only keyword search is scored. A `--limit` run with `--semantic` scores semantic search too, and so does a run on your own corpus (`--cases`). On a large library of your own it embeds every asset, which can take most of an hour the first time; the run says so before it starts.
- `--selection-flag NAME`: the akm flag a query's selection goes on (`filter` by default); only a set with selections uses it. See "Selection sets".
- `--repeat N`, `--akm COMMAND`, `--label NAME` as for every eval.

Results go to `evals/retrieval/results/<UTC date>-<label>-<collection>/` (`private/retrieval/results/` for a custom corpus). The default label is `akm-<version>`. A full public run with `--semantic` takes about 6 minutes.

## Run your own set

`--cases DIR` runs a labelled set of yours. The folder holds:

- `queries.jsonl` and `qrels.jsonl`, in the format of `assets/README.md`. A query whose `kind` is `nontask` (or `chitchat`, `notification`, `log`, `status`) should get no result; every other query needs grades. A query can carry `searchArgs`, extra `akm search` flags; akm 0.9.0 and later refuse a flag they do not know, and earlier builds ignored it, so read the unknown-flag warning in `assets/README.md` first.
- `library/`: the folder akm indexes, or a link to it. The refs in `qrels.jsonl` are the refs `akm search` prints for it.
- `bundles.json`, only when `library/` is a folder of bundles: `{ "notes": "akm", "site": "website-snapshot" }`, each bundle's folder and adapter. Each bundle is indexed in place, read only, and its refs are `<folder>//<path>`.

## A dated set: `--cases evals/retrieval/assets/dated`

A separate, optional set for akm's date filters (`--since`, `--until` on `akm search`) and its recency tie-break: [its README](assets/dated/README.md). It has filter queries, tie-break queries and controls, and a sentinel guard. A filter query's qrels carry a `sentinel`, a banned asset outside the window that an unfiltered search ranks first. A build that ignores the flags, or refuses them, does not get its filter queries scored: the summary counts them under `unsupported` and gives the reason, and `by_kind` reports the kinds apart. The public collections and the eval's version are unchanged.

## A code set: `--cases evals/retrieval/assets/code`

A committed set of 30 code-shaped lookups (a flag, an identifier, a config key) whose answers sit inside fenced code of the public library; it measures akm#1272 (fenced-code identifiers in search): [its README](assets/code/README.md). The public collections and the eval's version are unchanged.

## Selection sets

Two separate, optional sets for selecting on frontmatter (akm#1437, akm#1412): matching assets should rank first, and relevant assets without the metadata should stay in the results, lower. They are not a release gate (the gate is a no-selection regression on the public collections) but the acceptance evidence for a `--prefer` change.

- [`assets/selection`](assets/selection/README.md): 36 hand-written notes in a team and a general bundle, 20 queries for the edge cases (team first, only a general note answers, partial multi-key matches, a missing key against another team's value, several values of one key, a selection that matches nothing, the same note in both bundles, an untagged team script, a metadata value that must not be ranked text).
- [`assets/selection-split`](assets/selection-split/README.md): the public library split into a team and a general bundle, its 101 judged queries once for each selection. `evals/retrieval/split` writes it from `split.json` at run time.

```
evals/retrieval/split                                   # writes .cache/selection-split
evals/retrieval/run --cases .cache/selection-split      # today's hard filter: --filter channel=publishing
evals/retrieval/run --cases .cache/selection-split --selection-flag prefer --akm "bun ~/code/akm-wt/src/cli.ts"
```

A query may carry `selection` (key to a value or a list of values) and `same_as` (see `assets/README.md`). The collector puts the selection on `akm search` and `akm curate` as `--<flag> key=value`, once for each value; `--selection-flag NAME` picks the flag (`filter` by default, `prefer` for a candidate). A build that refuses the flag (`UNKNOWN_FLAG`) leaves those queries out of the metrics (`unsupported`) and is not an error. `searchArgs` stays search-only. `metadata.jsonl` says which keys each asset carries; the scorer decides from it whether a returned asset matches the selection: `full`, `partial`, `conflict` (another value of a selected key) or `missing`. Qrels stay topical, so no pair is graded twice.

Metrics, for each column and for `by_kind` and `by_intent` (`team`: most relevant assets match; `general`: none; `mixed`):

| Metric | Meaning |
|---|---|
| `pref_ndcg_10` | nDCG@10 where a relevant full match gains one grade; the ideal order has the bonus too |
| `match_precision_k`, `irrelevant_match_k` | the share of the first k places (search 5, curate 4) that hold a relevant full match; that hold a full match graded below 2 or not at all |
| `first_match_rank` | the rank of the first relevant full match, 11 when it is not in the first 10; lower is better |
| `nonmatch_recall_10` | relevant assets that do not fully match in the first 10, over the lesser of 10 and how many there are |
| `partial_above_none`, `conflict_above_missing` | diagnostics only: the share of queries where a partial match outranks a non-match, and where another team's asset outranks one that lacks the key |
| `checks.unchanged` | the share of `same_as` queries whose list equals their partner's in the same run: a selection that matches nothing must change nothing (a hard filter returns nothing here, and the table shows it) |
| `checks.leaked` | leak queries (a metadata value found in no text) that returned anything in a keyword column; must be 0 |
| `calls` | per column: results per call, seconds p50 and p95, `out_tokens` (characters akm printed over 4, what the agent receives) and `load_tokens_k` (`estimatedTokens` of the first 5 search results, what loading them costs; curate prints none) |

Conflicts and partial matches are diagnostics, never part of the headline. The qrels grade topical relevance, not "my team's version", so `pref_ndcg_10` encodes the preference by assumption; results a candidate brings up that no qrels row covers count as not relevant, and `judged_10` says how many (grade them with the `codex-review` protocol of the 2026-10-15 expansion, which calls no lab model).

A candidate wins at about equal tokens when, against the no-selection and hard-filter baselines:

1. the `@none` and `control` lists equal the baseline build's, the leak query returns nothing, `unchanged` is 1 and the number of results per call is the same;
2. on team-intent queries `pref_ndcg_10` and `match_precision_k` rise and `first_match_rank` falls;
3. overall `ndcg_10` drops by at most 0.02, and `nonmatch_recall_10` (overall and for general-intent queries) by at most 2% relative;
4. `out_tokens` and `load_tokens_k` stay within 5% of the baseline's; a candidate that wins by returning fewer results or more fails;
5. between ties, the option with less machinery wins.

Keys are stand-ins until akm#1412: a team is `scope_channel` (selected as `channel`), a project `scope_agent` (selected as `agent`). Several values of one key need an akm with #1448 (a match is either); before it a repeated key keeps its last value, so the `both` and `multi-value` queries are meaningful only there.

## Refs

The qrels name an asset by the ref akm printed before akm#1432: the type folder, then the name (`knowledge/skills/x/references/a` for a note inside a skill). Since #1432 a ref is the file's path (`skills/x/references/a`), and a later akm may keep the extension. The collector brings every ref akm prints to the qrels' spelling from the hit's type (`oldSpelling` in `src/akm.ts`), once, where the hit is read. `samples.jsonl` holds that spelling, so old and new runs, and the qrels, stay comparable.

## How a query is scored

Each judgment grades an asset 0 to 3 for a query: 3 is exactly the asset to load, 2 relevant and useful, 1 same topic but no help, 0 unrelated. Grade 2 or 3 is relevant. A task query with no relevant asset is not scored, and is counted with the abstentions. A result naming a section (`ref#section`) counts as the asset.

Metrics, for each of four columns (`search` and `curate` on the keyword index, `semantic_search` and `semantic_curate` in a run with `--semantic`):

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

`label` pools the top 10 of `akm search`, `akm curate` and a plain BM25 for each task query, with the assets the author expected, asks a judge model to grade each unjudged pair 0 to 3, and appends the grade to `assets/qrels.jsonl` with the judge, a digest of the prompt, the date and a digest of the asset. Stop and rerun it at will; a pair whose asset changed is graded again. `--from RESULTS_DIR` pools a run's results instead, semantic columns included. `--cases DIR` grades your own set (no BM25), reports which judge gets your notes and proceeds without a confirmation prompt. The judge is `--judge-model ID` or `JUDGE_MODEL`, at `JUDGE_BASE_URL`. A judge that is a line of `models.json` takes that line's `chat` settings, as LongMemEval does: `temperature`, `max_tokens` or `max_completion_tokens`, and `reasoning_effort` replace the defaults of 0, `max_tokens` 2000 and `none`. Use one judge for a set: `label` and `run` warn when the qrels mix judges. The library's original grades are stamped judge `legacy`. The [2026-10-15 expansion](assets/judgment-expansion-20261015.md) fills the missing top-ten task-query pairs from saved keyword/semantic runs in both public collections; it uses explicit Codex review, preserves existing judgments, and does not run the collector or a judge endpoint. The [2026-11-03 expansion](assets/judgment-expansion-20261103.md) grades the rest with `fast/qwen3.6-35b-a3b`, and one reviewed correction (`claude-review`), so the library now mixes five judge labels.

## Domain mix

The public library has 251 assets and 2,033 judgment rows (2,001 query/asset identities after alias normalization), by top-level group:

| Group | Assets | Graded rows | Share of rows | Relevant rows |
|---|---:|---:|---:|---:|
| ai-skills | 87 | 692 | 34.6% | 183 |
| print | 45 | 532 | 26.6% | 187 |
| coding | 60 | 285 | 14.2% | 91 |
| e2e-testing | 13 | 162 | 8.1% | 44 |
| administrative | 20 | 137 | 6.8% | 47 |
| dev-workflow | 5 | 53 | 2.6% | 9 |
| reports | 5 | 43 | 2.1% | 14 |
| gws-setup | 6 | 34 | 1.7% | 7 |
| notify | 3 | 18 | 0.9% | 6 |
| writing | 3 | 16 | 0.8% | 7 |
| akm-migrate | 1 | 10 | 0.5% | 1 |
| cmyk-image-converter | 1 | 8 | 0.4% | 4 |
| development | 1 | 8 | 0.4% | 2 |
| other | 1 | 3 | 0.1% | 2 |
| all | 251 | 2001 | 100.0% | 604 |

`bun evals/retrieval/src/mix.ts` prints it, and a test fails when this one differs. Two groups hold 61% of the rows, so a score here says how akm ranks a library of a few tool and print domains. Check a change on the books and on a set of your own before calling it general.

## Licence

MPL-2.0. `../../NOTICE` credits the three public books the books' assets cover.
