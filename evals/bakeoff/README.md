# bakeoff

Which model runs akm's model-backed jobs best: valid output, correct facts, real quotes, speed?

akm hands work to a model: it consolidates memories, distils lessons, judges and triages proposals, and more. This eval gives a model work of that kind and scores the reply. It measures a model on a frozen snapshot of akm-style prompts, not akm. It never runs akm, so it cannot register a change to akm, such as a better prompt, parser, schema or repair turn: tuning any of those does not move its numbers. To measure akm, use the evals that run it (`evals/consolidate`, `evals/distill`, `evals/reflect`, `evals/extract`, `evals/judge-gate`, `evals/nightly` and `evals/promotion`). Use this one to compare models on the same fixed work.

There are 120 cases across 13 jobs. 88 run by default. The other 32 are legacy cases: jobs akm no longer asks a model for (see "Legacy cases"). Each reply is scored by deterministic checks. There is no judge model, and akm does not need to be installed.

Results are per model, so one run can compare several.

## The prompts

Every prompt is written out in `src/bakeoff.py` (`build_messages`). They were taken from akm and have not followed it since. `PROMPTS_VERSION` in that file names the akm they come from, and every `summary.json` carries it. It is `0.9.15-style`: nothing in this repository records the release the prompts were copied from, and the copies of akm's architecture pages that the cases read (`assets/public-akm/`) are nearly all 0.9.15's. The proposal-judging cases that compare an old page with a newer one also read 0.9.0, 0.9.2 and 0.9.8. A request is a bare chat completion with no JSON schema and no repair turn, which akm's own pipeline sends. Redoing the prompts for a later akm means changing `PROMPTS_VERSION` with them. Results with different prompt versions do not compare.

## Run

```
evals/bakeoff/run --corpus public
evals/bakeoff/run --corpus private
evals/bakeoff/run --corpus all
evals/bakeoff/run --model my-model --model my-other-model --repeat 3
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N cases: the first case of each job in turn, so a short run covers many jobs. It never picks a legacy case unless `--include-legacy` is given.
- `--tier compact|deep` runs one tier. See the table below.
- `--model ID` runs a model the way every eval does: ID is a line of `models.json` (its URL, its key in the environment variable it names, its `model` name), and any other ID is a model of the gateway in `.env`. Repeat it to compare models. Without it the model is `MODEL_NAME`. A line's `"private": true` is recorded in `summary.json` and nothing more: bakeoff reads none of your notes, so it never refuses a model for it.
- `--models FILE` compares several models and sets request options for each: `temperature`, `max_tokens`, `seed`, `extra_body`, `timeout` and `retries`. An entry names its model by `id`, as `--model` does, or by `model` and `base_url`. See `models.example.yaml`. It is not used together with `--model`.
- `--repeat N` runs the corpus N times, each a whole run into its own folder, `<UTC date>-<label>-r1` to `-rN`, with the usual `summary.json`. Beside them it writes `<UTC date>-<label>-repeat-summary.json`: the `metrics` of each model with every number replaced by its `min`, `max` and `mean` over the runs, and the same three for `n_errored` and `seconds` (the wall time of each run). For a run of one model they are also at the top, as `lib/repeat.ts` writes them for the other evals. With `--corpus all` each corpus has its own repeat summary and the side-by-side table is not printed. A `seed` in a model's options makes the runs alike on an endpoint that honours it, so leave the seed out when you want their spread.
- `--include-legacy` also runs the legacy cases. See "Legacy cases".
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name, or the names of the models joined with `-` for several `--model`, or the models file name.

The private run reads `private/bakeoff/assets/`. Make it first with `./generate-assets --only bakeoff`. The run stops with an error when it is missing.

Each run writes two files to `evals/bakeoff/results/<UTC date>-<label>/`, or to `private/bakeoff/results/` for the private corpus:

- `summary.json`: for each model, the metrics, how many cases ran, were scored and errored, the model name and the name the endpoint reports, and its `settings`: what shaped its requests (the endpoint without credentials, the name of the environment variable that held the key, `private`, `temperature`, `max_tokens`, `seed`, `extra_body` with secrets redacted, `timeout` and `retries`). The key is never written. For the run: the corpus, the label, the `git_commit`, `prompts_version`, `include_legacy` and `legacy_cases`, `grounded` (what the grounded cases are checked for, see below), `cases_sha256` and `assets_sha256` (digests of `cases.json` and of every file of the assets), `models_file` (the path and `sha256` of the `--models` file, null without one), `seed` (for the private corpus, the seed its assets were made from; null for the public one), the `limit`, the `tier` and the counts. Two runs are alike only when these agree.
- `samples.jsonl`: one line per model and case, with every check and its result, the time, the token counts and the model's raw reply.

It needs [uv](https://docs.astral.sh/uv/). The first run installs PyYAML.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used. For several models, or for options per model, use `--model` or a models file instead.

- Every case asks for one JSON value or one markdown file, and the checks need it as asked. A `<think>` block, a code fence and prose around the JSON are cut away before scoring. The JSON is the value that ends at the reply's last closing bracket, and the reader tries each opening bracket in turn to find where it starts, so a stray `{` before the JSON does not lose it. With two JSON values in a reply the later one is scored. A closing fence is cut only when an opening one was, so a reply that ends in a code block of its own keeps it. What must be right is the JSON itself: its keys, types and ranges. Broken JSON loses, and so does prose with a closing bracket in it after the JSON.
- An answer that sits in the reasoning is scored. When a reply has no `content` and its `reasoning_content` holds a `{`, the text from the first `{` to the last `}` of the reasoning is scored as the answer, and the row says so (`content_fallback: true` in `samples.jsonl`). A model that thinks and then answers properly is scored on its answer. One that only thinks aloud is scored on the JSON in its thoughts, which may be a draft. Read the rows with `content_fallback` apart.
- The compact tier has prompts up to about 1.2k tokens. The deep tier goes up to about 40k, so give the server a context of 48k or more, or run `--tier compact`.
- A reply is limited to 6000 tokens. A model that thinks first needs thinking turned off in the server, or an `extra_body` in the models file that does it. Thinking text is cut from a reply before it is scored.
- Requests use temperature 0. A busy endpoint or a dropped connection is retried up to five times. A request that times out, after 900 seconds, is not. `extra_body` is merged into every request, but it cannot set `model`, `messages` or `stream`: the run refuses a models file that tries.

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
| deep | production | 29 | akm's request shapes as of the prompt snapshot: pools of 20 to 35 memories, review-band judgments, ordered and chunked graph batches, complex session extraction, metadata enhancement and schema repair for six asset types. |

The `legacy` track is the original bake-off's cases. It is not the legacy cases below, which are picked by job from every track.

The jobs are memory consolidation, distillation, memory inference, graph extraction, metadata enhancement, lesson and proposal quality judging, memory contradiction detection, session extraction and summaries, reflect proposals, `remember` enrichment, schema repair and proposal triage.

`private/bakeoff/assets/` is the same suite with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. The files are rewritten first and `cases.json` after, with one mapping, so a name changes the same way in a file, in a file name and in what a correct reply must hold. It is made by `generate` and never published. `generate` then checks that every term a case expects is still in its files, or still out of them, the way it was in the public assets. The terms are `required`, `forbidden`, `keywords`, `topics`, `ordered`, `preserve`, `trigger` and `reason_terms`, a graph case's `entities`, `relations` and `forbidden_entities`, and `date`, `observed_at` and `append`. It also checks that every ref a case expects (`merge`, `delete`, `promote`, `contradict`, `protected` and `queued`, and a triage case's `ref`) is the ref of one of the case's files, so a file the rewrite renamed is renamed in the case too. The assets were already scrubbed, so the rewrite changes few names. It mostly changes tool names, numbers, versions and dates. The numbers in `cases.json` itself, such as `max_ratio`, are thresholds and stay as they are: only its strings are rewritten.

## Legacy cases

akm no longer asks a model for some of what the suite asks. Those cases are the legacy cases, 32 of the 120. `run` skips them unless you pass `--include-legacy`, and `verify` does not require them: it asks for coverage of the other 88 only, and checks that the legacy cases it finds still build their prompts and score a known good reply. Numbers from earlier runs do not compare with a run now. The default set is smaller, and the scorers changed (see "How the checks read a reply"). `--include-legacy` brings back the old set of cases, not the old scores. With the flag the headline numbers include the legacy cases, as they did, and each model's `legacy_jobs` in `summary.json` holds the same counts for them alone, so you can read them apart. Every sample row says whether its case is legacy.

| Job | Cases | Why it is legacy |
|---|---:|---|
| `graph_extraction` | 11 (4 focused, 4 original bake-off, 3 production) | akm 0.9.17 removed the entity graph (`reports/retired-evals.md`), so akm no longer asks a model for one. |
| `metadata_enhance` | 8 (4 focused, 4 production) | The review of 2026-10-11 counts it with the graph passes that 0.9.17 removed. Nothing in this repository shows that akm 0.9.26 still asks a model for it, and this was not checked against akm's changelog. |
| `reflect_proposal` | 13 (4 focused, 4 original bake-off, 5 production) | Since 0.9.25-alpha.3 reflect edits only the frontmatter and keeps the body byte for byte. All 13 cases ask for a "complete improved markdown body". |

A case is legacy by its job, decided in `legacy_reason` in `src/bakeoff.py`, and not by a field of `cases.json`. The private assets made earlier need no regenerating for it. A case that asks for what akm 0.9.26 does differently is not legacy for that alone. The 22 consolidation cases ask for merge, delete, promote and contradict operations, where 0.9.26's consolidate asks a pair judge for one of six labels (`duplicate`, `subsumed`, `supersedes`, `contradicts`, `overlap` or `unrelated`) and the claims each note holds alone (`evals/consolidate/README.md`). They stay in the default run, as the snapshot's task.

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

How the checks read a reply:

- The 27 grounded cases (the original bake-off's consolidation and distillation items, and three synthesis cases) check the shape, that every quote is an exact span of its source, the length, and which refs are cited. They also check the content: each lists `required` terms in `cases.json`, the identifiers, paths, numbers and decisions its sources hold, and the deliverable must keep them. A reply of the right shape with real quotes and the wrong content fails. The terms are literal, so a model that restates an identifier loses a check. A grounded case with no terms is graded on format and grounding only, and `grounded.scope` in `summary.json` says so. All the public cases have terms. Private assets made before the terms were added have none until you run `./generate-assets --only bakeoff` again.
- Frontmatter is read as YAML, so a block list or a folded description is read as written. Where the block is not YAML, its `key: value` lines are read as they stand.
- A graph case (legacy) scores a relation's direction and matches whole entity names: "Worker Service" is not "Candidate Worker Service Image", and a relation from B to A is not one from A to B.
- In `remember_enrich` an `observed_at` that is absent, null or empty means no date. A date the memory does not write fails.

## Check the suite

```
uv run --project evals/bakeoff/src --frozen python evals/bakeoff/src/bakeoff.py verify
uv run --project evals/bakeoff/src --frozen python -m unittest discover -s evals/bakeoff/src
```

`verify` runs offline. It checks the suite's coverage and files, runs every scorer on a known good reply and on replies that should fail, checks that every grounded case has terms and that a deliverable with the wrong content fails, and checks the request retries. These two commands are not part of `bun test`.

## Where it came from

The cases, the files and the scorers are from [akm-model-eval](https://github.com/itlackey/akm-model-eval). The harness is the same code with the cases moved out to `assets/cases.json`, any OpenAI-compatible endpoint, and results per model. What measured the server and not the model is gone: the three context-limit cases, and the token-rate figures.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
