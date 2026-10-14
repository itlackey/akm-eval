# longmemeval

How does akm do as a memory backend on LongMemEval, next to a full-context baseline?

[LongMemEval](https://github.com/xiaowu0162/LongMemEval) (Wu et al., ICLR 2025) has 500 questions, each with a history of about 50 chat sessions (around 115k tokens), asking about something said in one or a few of them. 30 have no answer in the history. This benchmark answers each question twice with the same model, and a judge grades both answers:

- **without akm**: the whole history in the prompt.
- **with akm**: the sessions stored in akm as memories, searched with the question; the model gets the five sessions akm returns.

It also scores what akm retrieved: how often a session that holds the answer is among the five.

The default uses **one keyword search**, with semantic search off. It tests raw-session retrieval with a fixed five-session cap; it does not exercise distillation, query decomposition, or repeated evidence gathering. The full-history arm can already see every required fact. A quality gain from AKM is something to measure, not assume.

For multi-session questions, inspect recall of **all required sessions** as well as hit rate. Finding one necessary session can still leave the question unanswerable. `--semantic` selects the existing semantic variant, whose effect needs its own measurement. Saved answer-call times exclude indexing, retrieval, and judging.

## Run

```
benchmarks/longmemeval/run --limit 20
benchmarks/longmemeval/run --model qwen3-27b --judge-model gpt-4o-2024-08-06 --limit 100
benchmarks/longmemeval/run --retrieval-only                 # no model, no judge: about five minutes for all 500
benchmarks/longmemeval/run --corpus custom --limit 20       # the rewrite: ./generate-assets --only longmemeval
benchmarks/longmemeval/run --cases ~/chats/longmemeval      # a folder with longmemeval_s_cleaned.json
```

- `--limit N` draws N questions at random in proportion to question type, under `--sample-seed N` (default 42, recorded as `sample_seed`).
- `--retrieval-only` ingests, searches and scores retrieval, with no model and no judge. Run it first on a new akm.
- `--semantic` searches with akm's semantic search too (its built-in model, 133 MB, downloaded once into `.cache/models/`). Each question's sessions are embedded as they are indexed, so it is slower. A search that does not come back as semantic is an errored call.
- `--resume DIR` carries on a stopped run, asking only the questions not done. The run must match: corpus, questions, eval version, model, judge and their endpoint hosts, akm and its config, and the code (`harness_sha256`). Otherwise it is refused; start a new run.
- `--repeat N` asks the same questions each time; it does not go with `--resume`.

The public data is the cleaned LongMemEval S release at the revision pinned in `assets/ASSETS.lock`. The first run fetches it into `assets/` (277 MB, MIT, never committed) and checks its sha256. The rewrite renames names, places and brands and moves dates back by one or two whole years, but keeps numbers (`--keep-values`), since answers are counted from the sessions; `generate` checks every answer found word for word in its evidence still is.

## What it needs from models

- **The model**: a context of 131k or more for the without-akm arm (a question that does not fit errors that arm only). Answers are limited to 512 tokens, so the model should not think first; any reasoning is stripped before the judge sees the answer, and an answer cut off inside its reasoning is scored wrong.
- **The judge**: `JUDGE_MODEL` or `--judge-model`, at `JUDGE_BASE_URL` (else the model's endpoint). It answers yes or no to the benchmark's own grading prompts, copied from `evaluate_qa.py`, in 10 tokens. Published numbers use `gpt-4o-2024-08-06`; with another judge the scores are not comparable, and `summary.json` says so in `notes`.

Every request sends temperature 0. On a local 27B a question took about three minutes without akm and half a minute with it, so use `--limit` first.

## How akm is used

For each question a fresh bundle holds each session as one memory (`# Chat session`, its date, `role: text` lines), under a name that says nothing about the answer. Then:

```
akm index --full
akm search --limit 5 --detail agent --format json -- "<the question>"     # --shape agent on akm 0.9.x
```

Keyword search by default. The returned sessions go into the same prompt as the baseline's, in the history's order, so the arms differ only in which sessions the model sees. akm's keyword index cuts a body at 16,384 characters; `sessions_over_projection_limit` counts the longer sessions (an upper bound).

## How a question is scored

A verdict is correct when the judge's reply holds "yes". A question is an abstention question when `_abs` is in its id.

| Metric | Meaning |
|---|---|
| `accuracy.without_akm`, `accuracy.with_akm` | questions marked correct of those the arm scored |
| `accuracy.difference` | with minus without, over questions both arms scored, with `ci95` and the questions they disagree on |
| `by_type` | both rates per question type |
| `retrieval` | over questions with an answer in the history, for the top 5: `hit_rate`, `recall`, `precision`, `mrr`, `ndcg`, `zero_hit_rate` |
| `retrieval_abstention` | abstention questions searched, left out of `retrieval` |

A small model that cannot use a 115k prompt can score better with akm; a large one can score worse when akm misses evidence. `retrieval` tells which. With 20 questions the interval of the difference is usually 20 points or more each side: compare nothing under 100 questions unless the gap is large.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `status` and `aborted_reason` (it is rewritten after every question, and aborts when the first three questions cannot be searched or answered), `model_endpoint` and `judge_endpoint` (hosts only), `temperature`, `max_tokens`, `search_mode`, `mode` (`retrieval-only` or null), `config`, `assets_sha256`, `seed` (of a rewrite: do not publish it), `sample_seed`, `sessions_loaded`, `sessions_over_projection_limit`, `answers_cut_off`, `answers_empty`, `judge_undecidable`, `timeouts`, `corpus_folder`, `harness_sha256`, `notes` and the `manifest`. `samples.jsonl`: one row per question with the key, what akm returned in rank order, and for each arm the answer, verdict, time and tokens.

## Licence

The code is MPL-2.0, except the judge prompts copied from LongMemEval, which are MIT (see `../../NOTICE`). The dataset is MIT, from the LongMemEval authors, and is not part of this repository.
