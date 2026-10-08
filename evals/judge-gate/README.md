# judge-gate

Does the quality judge pass good improve proposals and refuse bad ones?

`akm improve` has reflect propose revisions to your assets. A judge model reads each revision and decides whether it goes on to be accepted. A good judge passes the revisions that fix a real defect and keep every fact, and refuses the rest. This eval gives the judge 106 revisions whose right answer is known, and counts what it passes.

The model under test plays the judge. The prompt, the scoring and the pass rule are akm's own: the eval calls `akm improve judge`, so it follows the judge that your installed akm ships. It needs akm 0.9.25-alpha.2 or later, the first release with that command (on `PATH`, or named in `AKM_BIN`). It records the akm version it used.

## Run

```
evals/judge-gate/run --corpus public
evals/judge-gate/run --corpus private
evals/judge-gate/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N cases, in the good/bad proportion of the whole set. Use it to check a setup.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/judge-gate/assets/`. Make it first with `./generate-assets --only judge-gate`. The run stops with an error when it is missing.

Each run writes two files to `evals/judge-gate/results/<UTC date>-<label>/`, or to `private/judge-gate/results/` for the private corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit.
- `samples.jsonl`: one line per case, with the label, akm's outcome, its criterion scores, its reason and the time it took.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the judge.

- It must follow an instruction to return one JSON object. akm asks for strict JSON with a schema, and retries without one if the endpoint refuses.
- A case is up to about 7k tokens, so 16k of context is safe.
- akm asks the server to turn thinking off. A judge that thinks is slow, about a minute a case on a 27B model. If your model thinks anyway, turn it off in the server.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect errors in `samples.jsonl`.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 16384 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

The eval runs akm in a temporary folder with its own config, so it never reads or writes your akm bundle. It sends two cases at a time.

## Assets

- `assets/cases.jsonl`: 106 real reflect proposals, each labelled by review. 28 are good and 78 are bad. The fields, the labelling rubric and how the cases were scrubbed are in `assets/README.md`. The cases carry a canary string: do not train on them.
- `private/judge-gate/assets/cases.jsonl`: the same cases with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. Labels and diffs are kept. Each case's source, candidate, feedback and label reason are rewritten with one mapping, so a name or a number changes the same way in all of them: what differs between a source and its candidate still differs, and what is the same stays the same. It is made by `generate` and never published.

## Read the results

The metrics are counted over the cases the judge gave a verdict on. A case with no verdict, such as a timeout, counts as errored.

| Metric | Meaning |
|---|---|
| `good` | `passed` of `n` good revisions the judge passed. This is what a gate lets through that it should. |
| `bad` | `passed` of `n` bad revisions the judge passed. This is what it lets through that it should refuse. |
| `precision` | Of everything the judge passed, the share that was good: `passed_good / passed`. |

`outcomes` splits each label by akm's verdict: `pass`, `review` (not rejected, but not good enough to pass without a person), `reject` and `error`. Only `pass` counts as a pass. A reply that akm cannot read as the JSON it asked for, even after its one retry, goes to `review`: that is the model failing the format, and it is counted. A timeout or a provider error is `error`, and is left out of the counts.

For scale: a judge that passes everything gets good 28/28, bad 78/78 and precision 26%. A useful judge passes most good revisions and almost no bad ones. A change to the judge is worth keeping when `good` goes up and `bad` does not.

The set is small. One case is 3.6 points of `good` and 1.3 of `bad`, so read changes of a case or two as noise, and rerun before you trust a gap.

A model may have seen the public cases in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- `akm improve judge` takes the feedback as one string and judges it as negative feedback only when the string starts with `[negative]`. Reflect passes one line per feedback event and asks whether any line is negative. The eval puts the negative lines first so a mix is judged the way reflect judges it.
- The shipped judge changes with akm. Compare results only between runs with the same akm version.
- The private cases keep their labels and the size of each change. Their ids are rewritten too, so to pair a private case with its public one, use `private/judge-gate/map.json`.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
