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
```

- `--corpus` picks the dataset. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` asks N questions, drawn at random under the sample seed in proportion to each question type. It is never the first N, which is one type. Without it, all 500 are asked.
- `--sample-seed N` is the seed of that draw. The default is 42. It is recorded in `summary.json`.
- `--retrieval-only` uses no model and no judge. It ingests, searches, and scores what akm retrieves against the sessions that hold the answer. All 500 public questions take about five minutes. With akm 0.9.26 it gives a hit rate of 97.6%, recall 0.92 and mrr 0.92 at top 5, so run it first when you check a new akm: a drop there means a retrieval change.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.
- `--resume DIR` carries on a stopped run in its results folder. With the same corpus, model, judge and sample settings, it asks only the questions that are not done, and asks again any that errored.

Each run writes two files to `benchmarks/longmemeval/results/<UTC date>-<label>/`, or to `private/longmemeval/results/` for the private corpus:

- `summary.json`: the metrics, how many questions ran, were scored and errored, the model and judge names and the names the endpoint reports, the akm version, the dataset revision and checksum, the sample, the corpus and the git commit. For the private corpus it holds the checksum of the private file and the public revision it came from, and not the seed. It is rewritten after every question, so a run you stop still has one, with `"complete": false`.
- `samples.jsonl`: one line per question, with the question, the key, what akm returned, and for each arm the answer, the judge's verdict, the time and the token counts.

## The data

The public data is the cleaned release of LongMemEval, the S variant, at the revision pinned in `assets/ASSETS.lock`. The first public run fetches it into `assets/` (277 MB), checks its sha256 against the lock, and stops if it differs. Later runs use that copy. It is MIT licensed, is never committed and is ignored by git. Reading it takes about 1.2 GB of memory.

The private data is the same dataset rewritten from a seed by `lib/rewrite`. `./generate-assets --only longmemeval` makes it in about a minute and about 6 GB of memory, into `private/longmemeval/assets/`, fetching the public data first if needed. The run stops with an error when it is missing.

- A question, its answer and every session go through one rewrite map, so a name or a place changes the same way in all of them. `generate` checks that no answer loses its evidence: a key that is in the evidence sessions in the public data is still in them in the private data, and it stops without writing anything if one is not.
- Dates move back by one or two whole years, chosen by the seed. A session date keeps its month and day, and its weekday is recomputed. A date written in full in a chat moves back by 365 or 730 days, which is the same month and day except for a date after February 2024, where it is a day off. A bare year, or a month and a year, is not moved.
- The rewrite renames the words in host names everywhere, so "food.com" would make "food" a name. Words that occur 20 times or more in lower case are kept to stop that.
- It changes the names, places and brands in about one question in eight, and every date. Questions with nothing to rename are unchanged. A model that has memorised the public questions may still do better on them.
- Numbers and versions are kept (`--keep-values`), because the answers are counted from the sessions: how many days, how many times. The names of tools and products are renamed like any name, and the evidence check above passes with them renamed.

## What it needs from models

Set the model under test in `.env` as `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME`, and the judge as `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL`. Any OpenAI-compatible chat endpoint works. akm must be on `PATH`, or named in `AKM_BIN`. akm runs in a temporary folder with its own config, so it never reads or writes your bundle.

- **The model.** The without-akm arm sends the whole history, 110k to 130k tokens, so it needs a context of 131k or more. A question that does not fit is errored for that arm only, and the with-akm arm still runs. The with-akm prompt is about 15k tokens. Answers are limited to 512 tokens, so the model should not think first.
- **The judge.** It answers yes or no to the benchmark's grading prompts, which are copied exactly from the benchmark's `evaluate_qa.py`. That evaluator uses `gpt-4o-2024-08-06`. With another judge, or another snapshot of gpt-4o, the scores are not comparable to published LongMemEval numbers, and `summary.json` says so in `notes`, by the name the endpoint answers with. The judge sees only the question, the key and the answer, never the history.

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
akm search --limit 5 --shape agent --format json -- "<the question>"
```

akm runs with semantic search off, so the numbers come from its keyword index. Embeddings would need a model download. The question goes in as it is. The sessions it returns, in rank order, go into the same prompt as the baseline's, in the same format with their dates. The two arms differ only in which sessions the model sees.

## Read the results

| Metric | Meaning |
|---|---|
| `accuracy.without_akm`, `accuracy.with_akm` | Questions the judge marked correct out of the questions that arm scored, and the rate. `n_errored` counts questions the arm could not answer, for example because the history did not fit. |
| `accuracy.difference` | With akm minus without it, in accuracy, over the `n` questions both arms scored. `ci95` is its 95% interval. `only_with_akm` and `only_without_akm` are the questions the arms disagree on, which is where the difference comes from. |
| `by_type` | The same two rates for each question type. |
| `retrieval` | For the top `k` sessions akm returned, over all questions: `hit_rate`, the share of questions with an evidence session among them; `recall`, the share of the evidence sessions found; `precision`, the share of the five places that hold an evidence session, so fewer than five results leave places empty; `mrr`; `ndcg`; and `zero_hit_rate`, the share of questions akm returned nothing for. |

The without-akm arm has the whole history and the with-akm arm has five sessions, so a small model that cannot use a 115k prompt well can score better with akm. A large one may score worse when akm misses an evidence session. `retrieval` says which it is: a low `hit_rate` is a retrieval miss and not a reading failure.

Abstention questions have no answer in the history. An arm that sees less has less to be fooled by, so part of any difference on them comes from that.

A sample is noisy. With 20 questions the interval around a difference is usually 20 points or more on each side. `ci95` shows it. It is a normal approximation from the questions the arms disagree on, so it is rough when they disagree on fewer than about 10, and it is empty when they never do. Compare nothing under 100 questions unless the gap is large.

A model may have seen the public questions in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

Published LongMemEval numbers use gpt-4o-2024-08-06 as the judge and all 500 questions, on their own models and prompts. Put a figure from here beside one of those only when the judge is that one and the whole dataset was run, and say that the reader prompt is this eval's.

## Licence

The code is MPL-2.0, except the judge prompts copied from LongMemEval, which are MIT: see `../../NOTICE`. The dataset is MIT, from the LongMemEval authors, and is not part of this repository.
