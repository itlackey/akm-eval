# reflect

Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims?

`akm improve` has reflect revise an asset after negative feedback. Since akm 0.9.21 it acts only on assets that have negative feedback. Since 0.9.25-alpha.3 it edits frontmatter only: the model proposes a `description`, a `when_to_use` and a title, and akm applies them as a patch. akm keeps the body byte for byte, and adds a title only as a `# heading` when the body has none. This eval gives reflect 50 notes whose right result is known and counts what it gets right.

The model under test is reflect's engine. The prompt, the patch and the proposal queue are akm's own: the eval drives the installed akm CLI. It needs akm 0.9.25-alpha.3 or later (on `PATH`, or named in `AKM_BIN`) and records the akm version it used. It was run with akm 0.9.26.

## Run

```
evals/reflect/run --corpus public
evals/reflect/run --corpus private
evals/reflect/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs the first N cases. The first ten hold each class once and the first five mix defects and controls. Use it to check a setup.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/reflect/assets/`. Make it first with `./generate-assets --only reflect`. The run stops with an error when it is missing.

Each run writes two files to `evals/reflect/results/<UTC date>-<label>/`, or to `private/reflect/results/` for the private corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name, the model names that answered, the akm version, the corpus and the git commit.
- `samples.jsonl`: one line per case, with the outcome, each check, the fields reflect changed and their new text, the proposal itself, the model name that answered, akm's reason when it made no proposal, and the time it took. The proposal's text lets you score a result again when the checks change.

## How a case runs

Each case gets a new temporary akm folder with its own config, so the eval never reads or writes your bundle. The note goes into the bundle at its path, and these commands run:

```
akm index
akm feedback <ref> --negative --reason "<the feedback>"
akm improve <ref> --strategy reflect-only --json-to-stdout
akm proposal list
akm proposal show <id> --detail full
```

`reflect-only` is a strategy the eval writes into that config. It runs reflect and nothing else, with the model under test as the one engine, and it turns reflect's quality judge off, so every proposal reaches the checks. judge-gate scores the judge. akm exits 0 whatever reflect did, so the outcome comes from the reflect action in the improve result, and the proposal's text from the queue. Cases run one at a time.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used.

- It must follow an instruction to return one JSON object with three fields. akm asks for a JSON schema reply. When the endpoint refuses that, it asks for a one-line frame instead, and it gives the model one repair turn. A reply it still cannot read is `unusable`.
- A case is up to about 6k tokens, so 16k of context is safe.
- akm sends a temperature of 0.3 and asks the server to turn thinking off. If your model thinks anyway, turn it off in the server: a thinking model can spend its output before the JSON.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect errors in `samples.jsonl`.
- A case takes about ten seconds on a 27B model on a local GPU, so a full run takes under ten minutes.

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

## Assets

- `assets/cases.jsonl`: 50 cases. 32 carry one injected defect of a kind akm names, in six classes. 18 are controls, in four. Each has the note, the feedback a user leaves and what a correct result is. The classes, the fields and how the cases were made are in `assets/README.md`. The cases carry a canary string: do not train on them.
- `private/reflect/assets/cases.jsonl`: the same cases with names, hosts, ids and dates rewritten from a seed by `lib/rewrite`. A case's note, its path, its feedback, its forbidden terms and its anchors go through one mapping, so a name or a date changes the same way in all of them. `generate` checks that each rewritten note still holds the defect its class names, and only that one, and writes nothing when one does not. It is made by `generate` and never published.

## The checks

No judge model scores a case. Each check looks at the proposal and the note.

| Check | Applies to | Passes when |
|---|---|---|
| `body_kept` | every case | The body is the note's body, byte for byte. The one heading akm adds for a missing title is allowed there. |
| `defect_fixed` | defects | The defect is repaired and what the note said stays. A split or escaped-quote description keeps every word, because akm tells the model to repair only the break. A cut-off one keeps its names, numbers and paths, and a restatement in other words is fine. The rest of the per-class rules are in `assets/README.md`. |
| `no_extra_change` | every case | No field changes except the one the class allows. A change to any other field is churn. A `type:` line akm adds does not count. |
| `no_invented` | every case | Each number, name with two capitals, path or dotted name in a new value is in the note, and the new values hold none of the case's forbidden terms. |
| `not_current` | `historical` | A new `when_to_use` names a version or date the note records, or says the note is historical. Leaving it alone passes. |

A case is correct when reflect gave a usable answer and every check that applies passes.

## Read the results

| Metric | Meaning |
|---|---|
| `defects` | `correct` of `n` defect cases. This is how often reflect fixes what akm names. |
| `controls` | `correct` of `n` control cases. This is how often reflect leaves a note alone when it should, or changes it with care. |
| `proposals` | How many proposals reflect made, and how many of them touched the body. |
| `classes` | The same per class, with the `outcomes` and the `failed` checks. |

`outcomes` splits each class by what reflect did: `proposal`, `none` (it proposed no change), `refused` (akm's own filter refused the revision because it held placeholder text, talk about the edit itself, or frontmatter copied into the body), `unusable` (the reply was not the JSON akm asked for, even after its repair turn) and `error`. A refused or an unusable answer is never correct: the model failed. A timeout, a provider error or an akm failure is `error` and is left out of the counts. `failed` counts, for each check, the cases that failed it.

`touched_body` should be 0. With akm 0.9.26 the body changes only by the heading akm adds for a missing title, and that is not counted. A count above 0 means akm edited a body, and this guards against that.

For scale, run with akm 0.9.26 and a scripted model: one that never proposes a change fixes 0 of 32 defects and keeps 18 of 18 controls. One that rewrites every field fixes none and keeps none. A useful model fixes most defects and keeps most controls. The `historical` class is a known weak spot, so read it on its own.

The set is small. One defect case is 3.1 points of `defects` and one control is 5.6 points of `controls`. Read a change of a case or two as noise, and rerun before you trust a gap.

A model may have seen the public cases in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- A note with frontmatter but no description gets one from akm when the model gives none, made from the note's title or first heading. That does not count as a fix: the `description-missing` cases ask for the model's own description.
- `description-truncated` and `body-defect` are defects akm's rules reject, but its list of problems does not name them: the prompt tells the model that akm found nothing wrong. Reflect cannot change a body at all, so for `body-defect` the right result is no change.
- The library has no memories or lessons, so the cases cover knowledge, skills, agents, commands and workflows.
- What reflect does changes with akm. Compare results only between runs with the same akm version.
- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- A gateway may serve one model name from several providers. `served` in `summary.json` counts the names the responses gave, so you can see when a run was split.
- The private cases keep their ids, so a private case pairs with its public one by id. `private/reflect/map.json` lists what was renamed.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
