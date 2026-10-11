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

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number. `private` is a light rewrite of the same 106 cases, not held-out data (see Assets).
- `--limit N` runs N cases, in the good/bad proportion of the whole set. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--strategy NAME` makes the akm improve strategy NAME the default of the config the eval writes, in place of `default`. It can be a strategy that `--config-patch` defines, or one akm ships. akm's judge takes its quality gate from that strategy. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. The patch is merged last, so it can change the engine too, such as its temperature. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/judge-gate/assets/`. Make it first with `./generate-assets --only judge-gate`. The run stops with an error when it is missing, and when it was made from public cases that have changed since (a case or a label). `generated.json` in that folder says what the assets were made from: the seed and a digest of the public cases file. The error says to make them again.

Each run writes two files to `evals/judge-gate/results/<UTC date>-<label>/`, or to `private/judge-gate/results/` for the private corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name, the akm version and build (`akm_bin`, `akm_build`), the corpus, the strategy and config patch (`strategy`, `config_patch`) and the git commit.
  - `status` is `complete` when the run went through its cases and `aborted` when it stopped early, and then `aborted_reason` says why (it is `null` otherwise). The summary is written before the run exits with an error, so a partial run is a summary with `status: "aborted"` and `n_run` below `n_cases`, and its numbers cover only the cases that ran.
  - `timeouts` counts the cases where akm ran into its time limit of 15 minutes and was killed. They are errored too, and their rows have `timed_out: true`, so a slower akm shows as that and not as unexplained errors.
  - It also says what the run was made from. `config` is the akm config the eval wrote, with any key redacted and each `endpoint` written as `<MODEL_BASE_URL>` (a URL can carry a key or credentials, and the rows hide it as well), and `engine` the LLM engine of that config: its name, model, the host of its endpoint, `temperature`, `enableThinking` and `timeoutMs`. `assets_sha256` is a digest of the cases file the run read. It is the same on every machine and changes when a case or a label does, so two runs with another digest scored other cases. `seed` is the seed that made the private cases (the one in `generated.json`, else the one in `private/seed`), and `null` for the public corpus or when none is recorded.
- `samples.jsonl`: one line per case, with the label, the severity of a bad case, akm's outcome, its criterion scores, its reason and the time it took. A `review` with a `score` of null is a case akm gave no verdict on (see "Read the results").

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is the judge.

- It must follow an instruction to return one JSON object. akm asks for strict JSON with a schema, and retries without one if the endpoint refuses.
- A case is up to about 7k tokens, so 16k of context is safe.
- Requests use temperature 0 and ask the server to turn thinking off, so that two runs differ by the model and not by its sampling. The eval sets both in the engine of the config it writes, and `summary.json` records them under `engine`. A judge that thinks is slow, about a minute a case on a 27B model. If your model thinks anyway, turn it off in the server.
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

- `assets/cases.jsonl`: 106 real reflect proposals, each labelled by review. 28 are good and 78 are bad. Each bad case also has a `severity`: 67 are `harmful` (a fact is invented, reversed or dropped) and 11 are `churn` (every fact survives and only the form changed: an intro, headings, a table of contents, backticks, reworded prose). The fields, the labelling rubric and how the cases were scrubbed are in `assets/README.md`. The cases carry a canary string: do not train on them.
- `private/judge-gate/assets/cases.jsonl`: the same cases with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. Labels and diffs are kept. Each case's source, candidate, feedback and label reason are rewritten with one mapping, so a name or a number changes the same way in all of them: what differs between a source and its candidate still differs, and what is the same stays the same. It is made by `generate` and never published.

  It is a light perturbation of the public cases, not a held-out set: about 3 to 5 percent of the words change, and the prose, the labels, the severities and the diffs are those of the same 106 cases. A model that has memorised the public cases still recognises them after a name changes. `generate` checks each case against the public one before it writes anything: the label, the severity, the set and the kind are kept; so are the line counts, the number of negative feedback lines, the number of lines that differ between the source and the candidate, and every fact that the label reason quotes or names (a number, version, path or identifier) and that the texts hold. The labels go through the rewrite with `--min-count 1000000`, so a reason cannot make a name the texts did not. Everything is made in a folder beside the assets and moved into place only when every check passes, so a run that fails leaves the files of the run before. `generated.json`, beside the cases, holds `{ seed, inputs_sha256, rewrite }`, and `run --corpus private` checks it.

## Read the results

The metrics are counted over the cases the judge gave a verdict on. A case that failed, such as an akm that crashed or ran into its time limit, counts as errored.

| Metric | Meaning |
|---|---|
| `good` | `passed` of `n` good revisions the judge passed. This is what a gate lets through that it should. |
| `bad` | `passed` of `n` bad revisions the judge passed: the harmful and the churn together. This is what it lets through that it should refuse. |
| `bad_harmful` | `passed` of `n` bad revisions that invent, reverse or drop a fact. What a gate must never pass. |
| `bad_churn` | `passed` of `n` bad revisions that change only the form and keep every fact: an intro, headings, a table of contents, reworded prose. The rubric calls them bad because they fix nothing. |
| `precision` | Of everything the judge passed, the share that was good: `passed_good / passed`. |

`outcomes` splits each label by akm's verdict: `pass`, `review` (not rejected, but not good enough to pass without a person), `reject` and `error`. Only `pass` counts as a pass. akm gives a score of -1 and routes the case to review when the judge gave no verdict: a reply it could not read as the JSON it asked for, even after its one retry, or a judge call that timed out or failed inside akm. Its verdict says which only in its text, which changes with akm, so every such verdict is a `review` whatever the text says: it did not pass, and it is counted. Its `score` in `samples.jsonl` is null, which tells it from a judged review. `error` is an akm that exits non-zero or is killed at the time limit, a verdict with no `pass` and `score`, and a -1 that akm did not route to review, such as with no engine configured. Errored cases are left out of the counts.

The run stops after 5 cases in a row with no verdict, whenever they come: errors, and reviews with a null score. A dead endpoint, a wrong key or a model that cannot answer in JSON would otherwise take the whole set. The summary is written first, with `status: "aborted"`.

For scale: a judge that passes everything gets good 28/28, bad 78/78 (harmful 67/67, churn 11/11) and precision 26%. A useful judge passes most good revisions and almost no harmful ones. A change to the judge is worth keeping when `good` goes up and `bad_harmful` does not. Read `bad_harmful` as the harm number: `bad` adds the churn cases to it, and a judge that refuses churn is doing what the rubric asks but not guarding a fact.

The set is small. One case is 3.6 points of `good`, 1.3 of `bad`, 1.5 of `bad_harmful` and 9.1 of `bad_churn`, so read changes of a case or two as noise, and rerun before you trust a gap.

Two things about the labels limit what `good` and `bad` say:

- The labels do not all follow the rubric. It calls a real fix with an added intro, headings or reworded prose bad, and 15 of the 28 good cases have a label reason that admits one ("plus a short intro", "plus headings", "splits one paragraph into sections", "Vaguer description", "Leaves redundancy", reflowed lines). Another 7 change only the description, repairing a stray period. So `good` is mostly the gate passing small, clean repairs, and a judge is asked to pass an intro in the good set and refuse the same kind of churn in the bad set. No label has been changed; read `good` and `bad_churn` with that in mind.
- Feedback is not balanced across the labels: 5 of the 28 good cases have any feedback and 35 of the 78 bad ones (14 with a `[negative]` line, all of them harmful; 1 good case has one). It follows the set the case came from more than the case: the July and August cases have none, because it had expired before export. A judge that refused every case with feedback, with no judgement at all, would pass 23 of the 28 good cases and 43 of the 78 bad ones. Read `good` and `bad` against that, and not against 100% and 0%.

A model may have seen the public cases in training. A much better public score than private score points to that, and no gap does not rule it out, because the private corpus is a light rewrite of the same cases and not held-out data. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- `akm improve judge` takes the feedback as one string and judges it as negative feedback only when the string starts with `[negative]`. Reflect passes one line per feedback event and asks whether any line is negative. The eval puts the negative lines first so a mix is judged the way reflect judges it.
- The shipped judge changes with akm. Compare results only between runs with the same akm version.
- The private cases keep their labels and the size of each change. Their ids are rewritten too, so to pair a private case with its public one, use `private/judge-gate/map.json`.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
