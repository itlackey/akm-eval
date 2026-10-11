# longmemeval

How does akm do as a memory backend on LongMemEval, next to a full-context baseline?

[LongMemEval](https://github.com/xiaowu0162/LongMemEval) (Wu et al., ICLR 2025) tests the long-term memory of a chat assistant. It has 500 questions. Each comes with a history of about 50 chat sessions, around 115k tokens, and asks about something said in one or a few of them. The question types are single-session (user, assistant, preference), multi-session, temporal reasoning and knowledge update, and 30 questions have no answer in the history.

This benchmark answers each question twice with the same model and grades both answers with a judge:

- **without akm**: the model gets the whole history in the prompt.
- **with akm**: the sessions are stored in akm as memories, akm searches them with the question, and the model gets only the five sessions akm returns.

It reports both scores and the difference between them. It also reports what akm retrieved, with no model: how often a session that holds the answer is among the five.

## Run

```
benchmarks/longmemeval/run --corpus public --limit 20
benchmarks/longmemeval/run --corpus private --limit 20
benchmarks/longmemeval/run --corpus all
benchmarks/longmemeval/run --retrieval-only
benchmarks/longmemeval/run --retrieval-only --semantic
```

- `--corpus` picks the dataset. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` asks N questions, drawn at random under the sample seed in proportion to each question type. It is never the first N, which is one type. Without it, all 500 are asked.
- `--sample-seed N` is the seed of that draw. The default is 42. It is recorded in `summary.json` as `sample_seed`, which is not `seed`, the seed that made the private dataset (see below). A run that asks every question draws nothing and has `sample_seed: null`.
- `--retrieval-only` uses no model and no judge. It ingests, searches, and scores what akm retrieves against the sessions that hold the answer. All 500 public questions take about five minutes with keyword search. Run it first when you check a new akm: a drop there means a retrieval change. With akm 0.9.26 it gave a hit rate of 97.6%, recall 0.92 and mrr 0.92 at top 5 over all 500 questions, which was before the 30 abstention questions were left out of the means (see "Read the results"). The figures over the 470 others have not been measured yet, so do not compare a run to those three numbers.
- `--semantic` searches with akm's semantic search as well as its keyword index. See "How akm is used". The default is keyword search alone, and `summary.json` records which one ran, as `search_mode`.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.
- `--resume DIR` carries on a stopped run in its results folder. With the same corpus, model, judge, endpoints, akm (version, command, build, its uncommitted changes and config), search mode, dataset files (`assets_sha256`) and sample settings, it asks only the questions that are not done, and asks again any that errored. A folder written by an older version of this eval is not resumed: its rows were made under other settings. The resumed folder gets its `.running` marker again, and every run removes the marker of its folder when it ends, so `--corpus all` leaves none behind for the corpus that has finished.

Each run writes two files to `benchmarks/longmemeval/results/<UTC date>-<label>/`, or to `private/longmemeval/results/` for the private corpus:

- `summary.json`: the metrics, how many questions ran, were scored and errored, the model and judge names and the names the endpoint reports, the akm version and build (`akm_bin`, `akm_build`), the dataset revision and checksum, the sample, the corpus and the git commit. It is rewritten after every question, so a run you stop still has one, with `"complete": false`. `status` is `complete` when the run asked every question and `aborted` when it did not, and then `aborted_reason` says why: a run that stopped because the first three questions could not be searched or answered says so, and a summary written while a run is going, or left by one that was killed, says it had not asked every question. A run that gives up writes its summary first and then exits with an error. These keys say what the run used and how:
  - `model_endpoint` and `judge_endpoint`: the host (and port) each is called at, with no path or key. `null` for `--retrieval-only`.
  - `temperature` and `max_tokens` (`model`, `judge`): what every request sends. `null` for `--retrieval-only`.
  - `search_mode`: `keyword` or `semantic`. `reader_order`: `haystack` (see "How akm is used").
  - `config`: the akm config the eval wrote for the run's sandbox, as the file has it, with any secret redacted. For `--semantic` it holds the embedder (`embedding.localModel`) and its query timeout (`embedding.queryTimeoutMs`), so the model named under `--semantic` below is the one the run used. `--resume` compares it.
  - `assets_sha256`: one digest over the dataset files the run read, by name: `ASSETS.lock` and the questions for the public corpus, `rewrite.json` and the questions for the private one. The same files in another checkout give the same digest. For the private corpus it is a digest of the file as it is, where `dataset.sha256` is the one `rewrite.json` says.
  - `seed`: for the private corpus, the seed of the rewrite that made the assets, as a string: the one in `generated.json` beside them (see "The data"). It is not `private/seed` when the assets were made with `./generate-assets --seed N`, which leaves that file as it is. It is `null` for the public corpus. **A private summary holds the seed, so do not publish one.** The private `dataset` still holds the checksum of the private file and the public revision it came from, and not the seed.
  - `sample_seed`: the seed of the draw of the questions (`--sample-seed`), a different thing from `seed`. It is `null` when every question was asked and nothing was drawn. The same number is in `sample.seed`.
  - `sessions_loaded` and `sessions_over_projection_limit`: how many sessions the questions loaded into akm (each question loads its own history), and how many of those are longer than 16,384 characters, where akm's keyword index cuts a body (see "How akm is used").
  - `timeouts`: the questions whose akm call timed out. They are also in `n_errored`, and a note says so, so that a slower akm shows as a slower akm.
  - `metrics.retrieval_abstention`: how many abstention questions were searched. They are left out of `metrics.retrieval`.
- `samples.jsonl`: one line per question, with the question, the key, what akm returned in rank order, and for each arm the answer, the judge's verdict, the time and the token counts. `timed_out` is true when the question's akm call timed out. `n_sessions` and `sessions_over_projection_limit` count the question's sessions.

## The data

The public data is the cleaned release of LongMemEval, the S variant, at the revision pinned in `assets/ASSETS.lock`. The first public run fetches it into `assets/` (277 MB), checks its sha256 against the lock, and stops if it differs. Later runs use that copy. It is MIT licensed, is never committed and is ignored by git. Reading it takes about 1.2 GB of memory.

The private data is the same dataset rewritten from a seed by `lib/rewrite`. `./generate-assets --only longmemeval` makes it in about a minute and about 6 GB of memory, into `private/longmemeval/assets/`, fetching the public data first if needed. The run stops with an error when it is missing.

- **What is in `private/longmemeval/`.** `assets/` (the questions and `rewrite.json`), `map.json` (the rewrite map, never published) and `generated.json`, the manifest: `{ version, seed, sample_seed, inputs_sha256, generator_sha256, outputs_sha256 }`. `seed` is the seed of the rewrite, the same as in `map.json`. `sample_seed` is `null`: generating draws no questions, and a run draws its sample under `--sample-seed`. `inputs_sha256` is the digest of the public `assets/ASSETS.lock`, which pins the dataset by revision and checksum (`generate` checks the dataset file against it before it reads one). `generator_sha256` is the digest of the code that makes the assets: `lib/rewrite/rewrite.ts` and `lexicon.ts`, and this benchmark's `generate.ts`, `dataset.ts` and `manifest.ts`. `outputs_sha256` is the digest of the files it wrote: the questions, `rewrite.json` and `map.json`. `version` is the format of the manifest, 1 for now, and a run refuses a manifest of another format as it refuses a missing one.
- **Nothing half made.** `generate` builds the whole tree, the manifest too, in `private/longmemeval/.staging`, and checks it there: one rewritten file per question and every question the shape it had, no answer out of its evidence, the questions on disk are the bytes it meant to write and `rewrite.json` names their checksum and the public dataset, the map holds this seed, and the manifest names the digest of the files as they are. Only when every check passes are `assets/`, `map.json` and `generated.json` moved into place, the manifest last. A generation that fails at any step leaves the assets, the map and `generated.json` of the run before byte for byte as they were, and says so. A process killed while the files move leaves no `generated.json`, which the run refuses, and the earlier files in `private/longmemeval/.old`.
- **`run --corpus private` refuses a tree the manifest does not vouch for.** It stops before it makes a results folder, and says to run `./generate-assets --only longmemeval`, when `generated.json` is missing or is not a manifest of the format it reads, when `inputs_sha256` is not the digest of the `ASSETS.lock` in this checkout (the public dataset moved on), when `generator_sha256` is not the digest of the generator in this checkout (a change to `lib/rewrite` or to `generate.ts`, `dataset.ts` or `manifest.ts` makes older assets stale), or when the questions, `rewrite.json` or `map.json` are not the files `outputs_sha256` names (edited by hand, replaced, missing, or left by a generation that stopped). Assets made before `generated.json` existed have to be made again. Under `--corpus all` the check comes before the public run.
- **Two seeds.** `seed` is the rewrite's, from `generated.json`, so `./generate-assets --seed N` is recorded as N whatever `private/seed` holds. `sample_seed` is the draw's. A summary has both, and neither stands in for the other.
- A question, its answer and every session go through one rewrite map, so a name or a place changes the same way in all of them. `generate` checks that no answer loses its evidence: a key that is in the evidence sessions in the public data is still in them in the private data, and it stops without writing anything if one is not. The check covers only the questions whose answer is in its evidence word for word. An answer that is counted from the sessions (how many days, how many times) or put in other words passes it unchecked, and an answer that is a number or a few letters is found in almost any text, so for those the check says little. `rewrite.json` says how many questions it covered, as `evidence_check: { questions, checked }`.
- Dates move back by one or two whole years, chosen by the seed. A session date keeps its month and day, and its weekday is recomputed. A date written in full in a chat (`2024-03-05`, `2024/03/05`, `March 5th, 2024`, `5 Mar 2024`) moves back by the same number of calendar years, so it keeps its month and day as well, and the 29th of February of a year with none before it becomes the 28th. A bare year, or a month and a year, is not moved, so a chat can still name a year that no longer fits the dates around it.
- The rewrite renames the words in host names everywhere, so "food.com" would make "food" a name. Words that occur 20 times or more in lower case are kept to stop that.
- It changes the names, places and brands in about one question in eight, and every date. Questions with nothing to rename are unchanged. A model that has memorised the public questions may still do better on them.
- Numbers and versions are kept (`--keep-values`), because the answers are counted from the sessions: how many days, how many times. The names of tools and products are renamed like any name, and the evidence check above passes with them renamed.

## What it needs from models

Set the model under test in `.env` as `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME`, and the judge as `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL`. Any OpenAI-compatible chat endpoint works. akm must be on `PATH`, or named in `AKM_BIN`. akm runs in a temporary folder with its own config, so it never reads or writes your bundle.

- **The model.** The without-akm arm sends the whole history, 110k to 130k tokens, so it needs a context of 131k or more. A question that does not fit is errored for that arm only, and the with-akm arm still runs. The with-akm prompt is about 15k tokens. Answers are limited to 512 tokens, so the model should not think first.
- **The judge.** It answers yes or no to the benchmark's grading prompts, which are copied exactly from the benchmark's `evaluate_qa.py`. That evaluator uses `gpt-4o-2024-08-06`. With another judge, or another snapshot of gpt-4o, the scores are not comparable to published LongMemEval numbers, and `summary.json` says so in `notes`, by the name the endpoint answers with. The judge sees only the question, the key and the answer, never the history. As in `evaluate_qa.py`, a question is an abstention question when `_abs` is anywhere in its id, a verdict is correct when it holds "yes", and the judge's reply is limited to 10 tokens, so a judge that thinks before it answers is cut off before its verdict. `judge_undecidable` and a note in `summary.json` count the verdicts that are not a plain yes or no.
- **Where each is called.** Every request, to the model and to the judge, sends temperature 0 and a limit on the tokens of the reply (512 for the model, 10 for the judge), and no seed. `summary.json` records the temperature, the limits and the host each is called at. A judge with no `JUDGE_BASE_URL` is called where the model is, also when `--model` names a line of `models.json` and `.env` points at another gateway.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 139264 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
JUDGE_BASE_URL=https://api.openai.com/v1
JUDGE_API_KEY=...
JUDGE_MODEL=gpt-4o-2024-08-06
```

The runs are slow, and the full benchmark is hours of model time. The whole history is about 115k tokens a question. On one 27B model served locally, a question took about three minutes without akm and about half a minute with it. Run with `--limit` first.

## How akm is used

For each question, a fresh bundle is made in the sandbox. Each session becomes one memory: `# Chat session`, the session date and the turns as `role: text` lines. Its file name is a hash of the question id and its place, so the name says nothing about whether it holds the answer. Then:

```
akm index --full
akm search --limit 5 --detail agent --format json   # akm 0.9.x: --shape agent -- "<the question>"
```

By default akm runs with semantic search off, so the numbers come from its keyword index. The question goes in as it is. The sessions it returns go into the same prompt as the baseline's, in the same format with their dates, and in the order of the haystack, as the baseline reads them, and not in rank order. The order is signal for a question about what changed or came first, and the baseline has it. `retrieved_session_ids` in `samples.jsonl` and the retrieval metrics keep akm's rank order. The two arms differ only in which sessions the model sees.

**Keyword body cut.** akm's keyword index holds a projection of a memory's body (without comments, fenced code and link targets) cut at 16,384 characters (see `../skillret/README.md`). Some LongMemEval sessions are longer than that. A session past the cut cannot be found by what it says after it. The run prints how many of the sessions it loaded are longer than 16,384 characters and records them as `sessions_over_projection_limit`, next to `sessions_loaded`, and each row has its own counts. The count is made on the memory file as written, before akm drops fenced code and comments, so it is an upper bound. It does not say how many evidence sessions are among them.

**`--semantic`.** The sandbox's akm then searches with its built-in embedder, bge-small-en-v1.5, fused with the keyword ranking (`semanticSearchMode: "auto"`), as `benchmarks/skillret` does for its semantic lines. The first run on a machine downloads the model (133 MB, from the Hugging Face Hub) into `.cache/models/` at the root of the repository, which git ignores, and later runs read it from there. Each question has its own history, so akm embeds the question's sessions as it indexes them, which takes longer than the keyword index, and the index is not kept between questions (`benchmarks/skillret` keeps its semantic index because its library never changes). akm's embedder reads only the first 512 tokens of what it indexes (see `../skillret/README.md`), so the embedding of a long session covers its opening. The run checks every answer: the index has to hold an embedding of each session, and every search has to say `searchMode` `semantic`. akm answers with keyword search alone (`fts-fallback`) when it cannot embed the question in time, and such an answer is an errored call, not a keyword result in the semantic column. The run stops, as for any akm that cannot search, when the first three questions fail. `summary.json` has `"search_mode": "semantic"` and the config the run used, with the embedder's name, and `--resume` will not mix the two modes or two configs.

## Read the results

| Metric | Meaning |
|---|---|
| `accuracy.without_akm`, `accuracy.with_akm` | Questions the judge marked correct out of the questions that arm scored, and the rate. `n_errored` counts questions the arm could not answer, for example because the history did not fit. |
| `accuracy.difference` | With akm minus without it, in accuracy, over the `n` questions both arms scored. `ci95` is its 95% interval. `only_with_akm` and `only_without_akm` are the questions the arms disagree on, which is where the difference comes from. |
| `by_type` | The same two rates for each question type. |
| `retrieval` | For the top `k` sessions akm returned, over the questions that have an answer in the history (the abstention questions are left out, see below): `hit_rate`, the share of questions with an evidence session among them; `recall`, the share of the evidence sessions found; `precision`, the share of the five places that hold an evidence session, so fewer than five results leave places empty; `mrr`; `ndcg`; and `zero_hit_rate`, the share of questions akm returned nothing for. |

The without-akm arm has the whole history and the with-akm arm has five sessions, so a small model that cannot use a 115k prompt well can score better with akm. A large one may score worse when akm misses an evidence session. `retrieval` says which it is: a low `hit_rate` is a retrieval miss and not a reading failure.

Abstention questions have no answer in the history. An arm that sees less has less to be fooled by, so part of any difference on them comes from that. They are graded and counted in `accuracy` and `by_type`, but they are left out of `retrieval`, as in the benchmark's own retrieval scoring, which skips every question with `_abs` in its id: there is no session to find, so including them would pull the means down with questions that cannot score. `metrics.retrieval_abstention.n` says how many were searched. Their rows in `samples.jsonl` still hold what akm returned.

A sample is noisy. With 20 questions the interval around a difference is usually 20 points or more on each side. `ci95` shows it. It is a normal approximation from the questions the arms disagree on, so it is rough when they disagree on fewer than about 10, and it is empty when they never do. Compare nothing under 100 questions unless the gap is large.

A model may have seen the public questions in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

Published LongMemEval numbers use gpt-4o-2024-08-06 as the judge and all 500 questions, on their own models and prompts. Put a figure from here beside one of those only when the judge is that one and the whole dataset was run, and say that the reader prompt is this eval's.

## Licence

The code is MPL-2.0, except the judge prompts copied from LongMemEval, which are MIT: see `../../NOTICE`. The dataset is MIT, from the LongMemEval authors, and is not part of this repository.
