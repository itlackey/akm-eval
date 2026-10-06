# bakeoff

Which model runs akm's model-backed jobs best: valid output, correct facts, real quotes, speed?

akm hands work to a model: it consolidates memories, distils lessons, extracts graphs, judges and triages proposals, and more. This eval gives a model that work the way akm does. There are 120 cases across 13 of those jobs. Each reply is scored by deterministic checks. There is no judge model, and akm does not need to be installed.

Results are per model, so one run can compare several.

## Run

```
evals/bakeoff/run --corpus public
evals/bakeoff/run --corpus private
evals/bakeoff/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N cases: the first case of each job in turn, so a short run covers many jobs.
- `--tier compact|deep` runs one tier. See the table below.
- `--models FILE` compares several models. See `models.example.yaml`.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name, or the models file name.

The private run reads `private/bakeoff/assets/`. Make it first with `./generate-assets --only bakeoff`. The run stops with an error when it is missing.

Each run writes two files to `evals/bakeoff/results/<UTC date>-<label>/`, or to `private/bakeoff/results/` for the private corpus:

- `summary.json`: for each model, the metrics, how many cases ran, were scored and errored, the model name and the name the endpoint reports, plus the corpus and the git commit.
- `samples.jsonl`: one line per model and case, with every check and its result, the time, the token counts and the model's raw reply.

It needs [uv](https://docs.astral.sh/uv/). The first run installs PyYAML.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used. For several models, or for options per model, use a models file instead.

- Every case asks for one JSON value or one markdown file, and the checks need it exactly as asked. A model that wraps its answer in prose loses for it.
- The compact tier has prompts up to about 1.2k tokens. The deep tier goes up to about 40k, so give the server a context of 48k or more, or run `--tier compact`.
- A reply is limited to 6000 tokens. A model that thinks first needs thinking turned off in the server, or an `extra_body` in the models file that does it. Thinking text is cut from a reply before it is scored.
- Requests use temperature 0. A busy endpoint or a dropped connection is retried up to five times. A request that times out, after 900 seconds, is not.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 49152 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

## Assets

`assets/cases.json` holds the 120 cases: the files each one reads, what a correct reply holds, its tier and its track. The 141 files beside it are the library the cases draw on: memories, lessons, knowledge, skills, commands, agents, workflows, sessions, 49 anonymised documents from an earlier model bake-off, and copies of akm's own architecture pages. They describe a fictional system or are scrubbed.

| Tier | Track | Cases | What it asks |
|---|---|---:|---|
| compact | focused | 52 | Four cases for each of the 13 jobs, over one small fictional system. The facts are precise, so the checks can be exact. |
| deep | legacy | 39 | The original bake-off's 24 consolidation and distillation items, and 15 more: long-document graph extraction, grounded revision, proposal judging and multi-document synthesis. |
| deep | production | 29 | akm's current request shapes: pools of 20 to 35 memories, review-band judgments, ordered and chunked graph batches, complex session extraction, metadata enhancement and schema repair for six asset types. |

The jobs are memory consolidation, distillation, memory inference, graph extraction, metadata enhancement, lesson and proposal quality judging, memory contradiction detection, session extraction and summaries, reflect proposals, `remember` enrichment, schema repair and proposal triage.

`private/bakeoff/assets/` is the same suite with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. The files are rewritten first and `cases.json` after, with one mapping, so a name changes the same way in a file, in a file name and in what a correct reply must hold. It is made by `generate` and never published. `generate` then checks that every term a case expects is still in its files, or still out of them, the way it was in the public assets. The assets were already scrubbed, so the rewrite changes few names. It mostly changes tool names, numbers, versions and dates. The numbers in `cases.json` itself, such as `max_ratio`, are thresholds and stay as they are: only its strings are rewritten.

## Read the results

| Metric | Meaning |
|---|---|
| `valid_output` | Replies with the right shape: the right JSON keys, types and ranges, or the right file layout. |
| `case_pass` | Cases where the shape is right and every check holds. |
| `checks` | For each case, the share of its checks that held, averaged over the cases. A reply of the wrong shape earns none, so saying nothing earns nothing. This is the partial credit: how many facts, orderings and limits were right. |
| `real_quotes` | Of the 27 grounded cases, those whose every quoted passage is an exact span of the source it cites. |
| `median_seconds` | The median time for one case, retries included. It depends on the server as well as the model. |

Only replies that came back are scored. A request that failed after its retries is `errored`, and says so in `samples.jsonl`. It does not count against the model.

`by_track` and `by_process` give the same counts for each track and each job. Read the tracks apart: compact is breadth, deep is size and realism. A model can ace one and fail the other, and one number across both hides it. One case moves `case_pass` by about a point, or two in the compact tier, so compare models by `checks` and by track before you trust a small gap.

`observed_models` is the name the endpoint says answered. A gateway may route one name to another model, so check it before you trust a comparison.

A model may have seen the public files in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Check the suite

```
uv run --project evals/bakeoff/src --frozen python evals/bakeoff/src/bakeoff.py verify
uv run --project evals/bakeoff/src --frozen python -m unittest discover -s evals/bakeoff/src
```

`verify` runs offline. It checks the suite's coverage and files, runs every scorer on a known good reply and on replies that should fail, and checks the request retries.

## Where it came from

The cases, the files and the scorers are from [akm-model-eval](https://github.com/itlackey/akm-model-eval). The harness is the same code with the cases moved out to `assets/cases.json`, any OpenAI-compatible endpoint, and results per model. What measured the server and not the model is gone: the three context-limit cases, and the token-rate figures.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
