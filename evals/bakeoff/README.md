# bakeoff

Does the model make what akm asks of it, in the model-backed jobs of akm that no other eval measures?

akm hands work to a model in many places. `evals/reflect`, `evals/distill`, `evals/extract`, `evals/consolidate`, `evals/judge-gate`, `evals/promotion` and `evals/nightly` each measure one job or a night of them. Five jobs are left that none of them scores. This eval runs those five with akm's own commands, in a sandbox, with the model under test as the engine, and scores what akm wrote.

The prompts, the parsers, the schemas and the repair turns are akm's: the eval drives the installed akm CLI, so a better prompt in a release moves its numbers. It replaces a Python bakeoff that scored a model on a frozen copy of akm's prompts (`0.9.15-style`), never ran akm, and so could not register a change to it. The jobs that other evals measure, and the ones akm no longer asks a model for, were retired with it: `reports/retired-evals.md` ("Bakeoff's frozen-prompt jobs") lists each one and what measures it now. Nothing of the old results carries over.

It needs akm 0.9.26 or later (on `PATH`, or named in `AKM_BIN`) and records the akm version it used. Compare results only between runs with the same akm version.

## The five processes

| Process | Cases | The command | What akm writes, and the eval reads |
|---|---:|---|---|
| `memory-inference` | 4 | `akm improve --strategy bakeoff-memory-inference`, with only memory inference on | `memories/<name>.derived.md`: a title, a description, tags, search hints and a content of 2 or 3 sentences |
| `remember-enrich` | 4 | `akm remember --enrich --name <name>`, the text of the memory on stdin | `memories/<name>.md` with the tags, the description and the date the model gave |
| `schema-repair` | 4 | `akm improve <lesson> --strategy bakeoff-schema-repair`, with only validation on | a pending proposal of source `schema-repair`: the lesson with a `description` and a `when_to_use` |
| `session-summary` | 1 | `akm proposal extract --type claude --session-id <id> --strategy bakeoff-session-summary` | `sessions/claude/<id>.md`: the summary as its description, and a `## Key topics` list |
| `consolidate-promote` | 2 | `akm improve --strategy bakeoff-consolidate-promote`, with only consolidate on | the promotions in the plan of consolidate's promotion pass, in `consolidation.planned` |

Each case runs in a sandbox of its own: a temporary folder with its own akm config and bundle, so the eval never reads or writes your bundle. akm runs with `semanticSearchMode: off`, so consolidate's pair pass finds no pairs, calls no model, and its retirements (measured by `evals/consolidate`) do not show.

## Run

```
evals/bakeoff/run --corpus public
evals/bakeoff/run --corpus custom
evals/bakeoff/run --corpus all
evals/bakeoff/run --process schema-repair --repeat 3
```

- `--corpus` picks the cases. `public` is the committed cases. `custom` is a folder of cases with a `corpus.json`: by default `private/bakeoff/assets`, the public cases rewritten from a seed. `all` runs both and prints the two results side by side, never as one number. `--corpus private` still works for one release, as `--corpus custom`. See "Corpora" in the root README.
- `--cases DIR` runs the corpus in `DIR`, which holds a `cases.json` and the files it names (see "Assets"). It is `--corpus custom --cases DIR`. A folder with no `corpus.json` is taken for your own notes, which are private: a model that `models.json` does not mark `"private": true` is refused before anything runs.
- `--process NAME` runs one process only.
- `--limit N` runs N cases, the first of each process in turn, so a short run covers every process.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256. There is no `--strategy`: each process has its own, and the patch can change them.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The custom run reads `private/bakeoff/assets/`. Make it first with `./generate-assets --only bakeoff`. The run stops with an error when it is missing, and when `private/bakeoff/generated.json` is missing, is not in the current format, or does not match what is here now: the public assets it was made from, the code of the generator (`generate.ts`, `inputs.ts`, `lib/rewrite` and its lexicon) or the files as generate wrote them. The error says to make them again.

Each run writes two files to `evals/bakeoff/results/<UTC date>-<label>/`, or to `private/bakeoff/results/` for a custom corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, the model name, the model names that answered, the akm version and build (`akm_bin`, `akm_build`), the corpus (`corpus`, `corpus_kind`, `corpus_private`, and `corpus_folder` when it is inside the repository) and the git commit. It also says what the run was made of, and whether it finished:
  - `config`: the akm config the eval wrote, with every `apiKey`, `api_key`, `token` and `secret` replaced by `<redacted>` (a `$NAME` reference to an environment variable is kept) and the model's endpoint written as `<MODEL_BASE_URL>`.
  - `engine`: the settings of the engine in that config: its name, `model`, the `endpoint` (the host and port, never the path), `endpoint_id` (a sha256 of the endpoint's identity), `temperature` (0), `enableThinking` (false) and `timeoutMs`.
  - `manifest`: what the run was made of, for `scripts/compare` and `scripts/rescore`: the collector and the scorer of this eval (version and digest), the digest of the input and of the labels of every case it selected, the akm, the config without the engine settings, the engine, and which cases were scored and which errored. See "The collector, the scorer and the golden files".
  - `assets_sha256`: the digest of the corpus folder, `cases.json` and the files it names, by path from the folder, so two runs on the same cases have the same digest wherever the repository is.
  - `seed`: for a rewrite, the seed its assets were made with (`corpus.json`); `null` for the public corpus and for your own.
  - `status`: `complete`, or `aborted` when the run stopped because the first five cases got no outcome. Then `n_run` may be less than the cases selected, and `aborted_reason` says why (otherwise `null`). The file is written before the run fails, so a folder that holds an aborted summary is not a whole run: do not compare it.
  - `timeouts`: how many of the errored cases ended because an akm command ran past its timeout (15 minutes) and was killed.
- `samples.jsonl`: one line per case, with the outcome, the checks and the raw output: the derived memory, the memory `akm remember` wrote, the repair proposal, the session asset, or the plan and the promotions. The raw output of a case is `outcome`, `reason`, `served`, `seconds`, `error`, `timed_out` and whichever of `derived`, `written`, `proposal`, `asset`, `planned`, `promoted` and `skipped` its process makes; the shape and the checks are scored from it and the case, so `scripts/rescore` can score a run again when the checks change, with no akm and no model.

## How a case runs

The commands, in order, with `--format json` added to each:

```
memory-inference:     akm index
                      akm improve --strategy bakeoff-memory-inference --no-sync --require-engines --json-to-stdout
remember-enrich:      akm remember --enrich --name <name>                       (stdin: the memory without its frontmatter)
schema-repair:        akm index
                      akm improve lessons/<name> --strategy bakeoff-schema-repair --no-sync --require-engines --json-to-stdout
                      akm proposal list --status pending --detail full
session-summary:      akm proposal extract --type claude --location <projects> --session-id <id> --strategy bakeoff-session-summary
consolidate-promote:  akm index
                      akm improve --strategy bakeoff-consolidate-promote --no-sync --require-engines --json-to-stdout
                      akm proposal list --status pending --detail full
```

The strategies are written into the config of the sandbox. Each runs the one process and turns the others off. Memory inference writes a derived memory and rewrites the frontmatter of its parent, which akm keeps behind `experimental.improveAutonomy`, so the config sets it. Session indexing is on, and `minSessionDuration` is 0. Consolidate's `minPoolSize` is 0, so a pool of 7 or 35 memories is considered.

akm exits 0 whatever the model did, so what happened comes from what akm wrote and from its own counts:

- **`output`**: akm made the thing the process makes. It is scored.
- **`unusable`**: akm ran and could not use the reply: it wrote no derived memory, no session asset, no repair, or it skipped a chunk of the pool. It is never correct, and it counts against the model.
- **`error`**: the case did not run to the end: a model call failed, akm crashed or ran past its timeout, or the endpoint was down (`--require-engines` stops an improve run at once). An error has no verdict and is left out of the counts. A timeout has `timed_out: true`.

Two things akm does not say. When a session summary fails, akm writes no asset and prints nothing, so the row says only that no asset was written. When `akm remember --enrich` fails it writes the memory without enrichment and warns on stderr: the eval reads the warning, an unusable reply from a failed call.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint, or name the model with `--model` (a line of `models.json`, or a model of the gateway). `JUDGE_*` is not used.

- It must follow an instruction to return one JSON object. akm asks for a JSON schema reply where it has one, falls back to a plain request when the endpoint refuses that, and repairs some replies itself.
- A case is a few thousand tokens, and the largest, a pool of 35 memories, is three chunks of 12, so 16k of context is safe.
- The eval sets temperature 0 and `enableThinking: false` on the engine, and `summary.json` records both under `engine`. akm's own default is a temperature of 0.3. `--config-patch` can change either.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect errors in `samples.jsonl`.
- A full run is 15 cases, one at a time: about 30 model calls, and one more for each improve run to probe the engine (`--require-engines`).

## The collector, the scorer and the golden files

The eval is on the run manifest (see "How results stay comparable" in the root README). Its files are split by what a change to them does:

- `src/collect.ts` is the **collector**: the sandbox, the akm config (`bakeoffConfig`) and its strategies, the commands, and how it reads what akm wrote. `lib/akm/akm.ts`, `lib/akm/overrides.ts` and `lib/cli.ts` are listed with it. A change to any of them changes what akm is asked or what is kept of its answer: bump the collector (`scripts/measurement/run bump bakeoff collector --reason "..."`), and earlier runs are no longer comparable with later ones.
- `src/score.ts` is the **scorer**: the checks, `makeRow` and `metrics`. A change to it changes what the eval scores: bump the scorer, and update the golden files in the same change. No run is invalidated: `scripts/rescore` scores any stored run again.
- `src/measurement.ts` declares both lists, the cases' `input` and `labels` that are digested per case, and how a stored row is read back into its raw output (`rawOf`). `src/inputs.ts` reads and checks a corpus and holds the digests of `generated.json`; `src/lib.ts` re-exports the three.
- `golden/` holds 8 cases, one or two of each process, with 46 raw outputs for them, and the row the scorer must give for each. The files akm wrote (a derived memory, an enriched memory, a repair proposal, a session asset) and the promotions are those of akm 0.9.26, run against a scripted model that answered each way a model can: the right answer, a fact or the date dropped, a date invented, the wrong shape, a trigger that is not concrete, a promotion too many, a reply in prose. The errors and the timeout are written by hand, since a dead endpoint stops akm before the case. `src/golden.test.ts` fails when a scorer change alters one row. `UPDATE_GOLDEN=1 bun test evals/bakeoff/src/golden.test.ts` writes the expected rows again, and the files say which scorer version they are for.

```
scripts/rescore/run evals/bakeoff/results/<UTC date>-<label>      # writes <UTC date>-<label>-rescored beside it
scripts/rescore/run --cases ~/notes/bakeoff <results folder>      # a custom run whose corpus is outside the repository
```

A run on the public corpus is scored again against the committed cases. A run on a custom corpus is scored against the folder its summary records as `corpus_folder`, which is a path from the repository root and is `null` for a folder outside the repository (its name can say what is in it): then `--cases DIR` names the folder. A result of the Python bakeoff is legacy and cannot be scored again.

`src/real.test.ts` runs every case of the public corpus through the real akm, against a model that answers as a script says: right, in prose and not at all. It runs only with `AKM_EVAL_REAL_AKM=1`, and with `AKM_BIN` naming the akm. The other tests use a fake akm (`src/fakes.ts`).

## Assets

`assets/cases.json` holds the 15 cases: for each, its `id`, its `process`, the `files` it reads and what it `expected`. The files beside it are the library the cases draw on, all fictional: 37 memories, 4 lessons that lack a `description` and a `when_to_use`, and one Claude Code session (`sessions/<project>/<id>.jsonl`, the place and the name akm reads a session from). The cases are those of the Python bakeoff that still apply, with the ids they had.

| Process | Case | Expects |
|---|---|---|
| `memory-inference` | 4 memories (`infer-*`) | `required` terms the derived memory must keep, a `date` it must keep, or `forbidden` terms it must not invent |
| `remember-enrich` | 4 memories (`enrich-*`) | the `observed_at` the memory writes, or null for one that writes none, and `keywords` the metadata must cover |
| `schema-repair` | 4 lessons (`repair-*`) | `keywords`, any of which the new fields must hold, and `trigger` terms, any of which the new `when_to_use` must hold |
| `session-summary` | `prod-session-summary` | `required` terms of the summary, `topics` of the key topics list, and `forbidden` terms |
| `consolidate-promote` | `consolidate-memory-pool` (7 memories), `prod-consolidate-full-pool` (35) | the `promote` refs, the `protected` refs, and `strict`: nothing else may be promoted |

Four things changed from the Python cases. The memory-inference and remember-enrich prompts are akm's, so a case no longer fixes them. `prod-session-summary` was a markdown transcript and is now the Claude Code session file akm reads. The two pool cases lost their merge, delete and contradict expectations, which akm no longer plans (its pair pass decides those, and `evals/consolidate` measures it), and `prod-consolidate-full-pool` lost `strict` and its queued memories: the labels that made 28 of its 35 memories "already queued" rested on a queue akm builds from its own promotions. The cases that fell away are in `reports/retired-evals.md`.

`private/bakeoff/assets/` is the same corpus with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. The files are rewritten first and `cases.json` after, with one mapping, so a name changes the same way in a file, in a file name and in what a correct result must hold. It is made by `generate` and never published. `generate` then checks that every term a case expects (`required`, `forbidden`, `keywords`, `topics`, `trigger`, `date`, `observed_at`) is still in its files, or still out of them, the way it was in the public assets, and that every ref it expects is the ref of one of its files. The assets were already scrubbed, so the rewrite changes few names. It mostly changes numbers, versions and dates. It writes into a work folder in `private/bakeoff/` and moves the result into place only when the checks pass, so a generation that fails leaves the earlier assets as they were. Beside the assets it writes `generated.json`: the `seed`, the `inputs_sha256` of the public assets, the `generator_sha256` of the generator's code, and the `outputs_sha256` of the assets as written.

## The checks

No judge model scores a case. Each check looks at the file or the plan akm made. A case is correct when its output has the right shape and every check holds.

| Process | The shape | The checks |
|---|---|---|
| `memory-inference` | a title, a description and a content that are not empty; 3 to 8 tags; 3 to 6 search hints (akm keeps at most 8 and 6, and needs one) | `retains <term>` for each required term, found in the title, the description, the tags, the hints or the content; `retains explicit date`; `does not invent <term>` |
| `remember-enrich` | 1 to 5 tags, all lower case, and a description. akm writes a description from the first sentences of the memory when the model gives none, so a missing one is not a failure of shape | `preserves explicit date` for a memory that writes one; `does not invent an observation date` for one that does not (no date, null and empty are the same); `metadata covers <keyword>` in the tags, the description and the date |
| `schema-repair` | a `description` of 20 characters or more and a `when_to_use` of 15 or more | `generated fields are grounded in the body`: the two fields hold one of the keywords; `trigger is concrete`: the `when_to_use` holds one of the trigger terms. A reply with a description only is refused by akm and is `unusable` |
| `session-summary` | a summary (the description) of 80 characters or more, and topics and tags that are not empty strings | `summary retains <term>`; `topics include <term>`, in the key topics list only; `summary omits <term>` |
| `consolidate-promote` | akm accepted a plan | `promotes <ref>`; `leaves protected <ref> untouched`; `no extra or missing promotions` for a strict case; `promotes only memories of the pool` |

A term is found with case and spacing ignored. A term of one word that ends in `y` also finds `ies`, `ied` and `ying`, so an inflection costs nothing.

The promotion check reads the model's plan, `consolidation.planned`, and not the queue. akm drops a promotion of the plan before it queues it: it did not queue a memory that was too small to promote (`promote_source_too_small`: the hot `operator-preference` and the one-line `cache-ttl-current` of the public pool are two), whatever the model chose. Reading the queue would hide the model's choice. The queue is stored in the row as `promoted`, and akm's reason for each promotion it dropped as `skipped`.

## Read the results

| Metric | Meaning |
|---|---|
| `valid_output` | Cases whose output has the right shape, of the cases that ran to the end. |
| `case_pass` | Cases whose shape is right and whose every check holds. |
| `checks` | For each case, the share of its checks that held, averaged over the cases. A case of the wrong shape earns none, so saying nothing earns nothing. |
| `median_seconds` | The median time for one case. It depends on the server as well as the model. |
| `by_process` | `n`, `valid_output`, `passed` and `checks` for each process, its `outcomes` (`output`, `unusable`, `error`) and `failed`, the cases that failed each check. |

A case that errored is left out of every count. One case moves `case_pass` by 6.7 points, and the processes have 1 to 4 cases each, so read a gap of a case or two as noise, compare by `checks` before you trust a small difference, and rerun with `--repeat`. `session-summary` has one case and tells you little by itself.

`served` counts the model names that answered, from the usage report of the improve run, so you can see when a gateway split a run. It is empty for `remember-enrich` and `session-summary`, whose commands report none.

A model may have seen the public cases in training. A much better public score than custom score points to that. Run the custom corpus on a local model, or on an API that does not train on your data.

## Notes

- What akm does changes with akm. Compare results only between runs with the same akm version. The processes are all `Evolving` or `Experimental` in akm's stability policy: the memory-inference pass is behind `experimental.improveAutonomy`, and `improve.strategies.*.processes.*` is an experimental config.
- A session is summarised after extract's own call. If that call fails or its reply is unusable, akm skips the session and writes no summary, so `session-summary` depends on the model for two replies. The extraction's output is not scored here: `evals/extract` does that.
- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- The old `models.yaml` file, `--models`, `--tier`, `--include-legacy` and the Python code are gone. A run compares models by running the eval once for each (`--model`), and `scripts/matrix` and `scripts/compare` compare the results.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
