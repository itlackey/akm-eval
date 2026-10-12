# akm-eval

One public repository for every akm evaluation and benchmark.

It holds our own evals, the published benchmarks we run akm against, and a public akm library the evals use: a snapshot of the shared bundle our lab's agents read. Most of them run against any OpenAI-compatible model, local or cloud. Two need more: `evals/agent-ab` and `benchmarks/terminal-bench` run opencode in Docker through Harbor, and opencode calls the Responses API. Two call no model: `evals/retrieval` and `benchmarks/skillret` score akm's search.

This layout replaces the earlier harness. The old content stays under the tag `legacy-2026-10`.

## Evals and benchmarks

`corpus/library` is the public akm library the evals use. Every other folder in the table is an eval or a benchmark with a `run` script. The table says what each one asks, which corpora it has, which flags its `run --help` lists beyond `--corpus`, `--limit` and `--label`, which akm it works with, and what its `summary.json` records. A test, `scripts/smoke/src/readme.test.ts`, runs every `run --help` and checks the table against it, so a flag that is added or dropped has to change the table too.

| Folder | Question it answers | Corpora | Flags | akm | `summary.json` records |
|---|---|---|---|---|---|
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | `public`, `private`, `own` | `--repeat` `--akm` `--semantic` | 0.9.26 | for each collection: `search_mode`, `n_assets`, `index_seconds`, `metrics` of `search` and `curate` (and the two semantic columns in a full run), with `ndcg_10_condensed`, the judged results alone, beside `ndcg_10`; `abstention`, `errored`, `timeouts`, `semantic_index`, `semantic_index_built_by`; `assets_sha256`, over the content of the indexed library, the bundle mappings, the queries and the qrels, and `assets`, with the digest of each of the four; it calls no model |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | `public`, `private` | `--repeat` `--strategy` `--config-patch` `--model` `--akm` | 0.9.25-alpha.2 or later | `metrics` for `good`, `bad` (split into `bad_harmful` and `bad_churn`), `precision` and `outcomes`; `rubric_version`; `status`, `aborted_reason`, `timeouts` |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | `public`, `private` | `--repeat` `--retrieval-queries` `--strategy` `--config-patch` `--model` `--akm` | 0.9.25-alpha.3 or later | `metrics` for `defects`, `controls`, `proposals`, `refused` and `classes`; `served`; `retrieval_queries`; `manifest`; `status`, `aborted_reason`, `timeouts` |
| `evals/distill` | Do distilled lessons say only what the source memory says? | `public`, `private`, `own`, `own-feedback` | `--repeat` `--strategy` `--config-patch` `--model` `--akm` | 0.9.26 (the `lesson-update` class needs 0.10.0) | `metrics` for `good_lessons`, `wrong_lessons`, `lesson_updates`, `by_class`, `outcomes`; `served_models`; `status`, `aborted_reason`, `timeouts` |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | `public`, `custom` | `--cases` `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` `--pool` `--timeout-ms` | 0.9.26 | `metrics` for `unsafe`, `precision`, `recall`, `classes` (with `--pool` also `pairs`, `calls`, `chunks`); `embedder`, `n_paired`, `served_models`; `corpus_folder`; `manifest`; `status`, `aborted_reason`, `timeouts` |
| `evals/extract` | Does extraction pull durable insights and preferences from session logs, and leave routine sessions empty? | `public`, `private` | `--repeat` `--strategy` `--config-patch` `--model` `--akm` | 0.9.26 or later | `metrics` for `insights`, `routine`, `planted` (with `saved_instruction`) and `classes`; `timeouts` |
| `evals/nightly` | Does a full nightly improve run give good results unattended, with no model-call failures? | `public`, `private` | `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` | 0.9.26 or later | `metrics` for `items`, `by_kind`, `failed`, `harm` and `calls`; `embedder`, `drain`, `pair_pass`, `calls_by`, `improve_ok`; `status`, `aborted_reason` |
| `evals/promotion` | Of the promotions consolidate proposes, how many does the drain's judgment tier accept, and are those the good ones? | `public`, `own` | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` | 0.9.26 | `metrics` for `precision`, `recall`, `bad_accepted`, `accepted`, `by_category`; `calls`; `status`, `aborted_reason`, `timeouts` |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | `public`, `private` | `--repeat` `--model` `--akm` `--akm-env` | akm-cli 0.9.26, or what `--akm` names | `status`, `aborted_reason`, `completion` (`expected`, `completed`, `failed`, `missing` and `unexpected`, overall and for each arm), `assets_sha256`, `engine`, `config`; `pins`, `akm_env`, `akm_install`, `job`, `libraries_sha256`, `timeouts` by arm, `metrics` (`delta`, `better`, `engagement`, a pass rate for each arm) and `report` with `sign_test` and `flips` |
| `evals/bakeoff` | Which model runs akm's model-backed jobs best, on a frozen set of prompts: valid output, correct facts, real quotes, speed? | `public`, `private` | `--tier` `--model` `--models` `--repeat` `--include-legacy` | none: it never runs akm | for each model `metrics` and `settings`; `prompts_version`, `include_legacy`, `legacy_cases`, `cases_sha256`, `assets_sha256` |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | `public`, `private` | `--sample-seed` `--retrieval-only` `--semantic` `--resume` `--model` `--judge-model` `--akm` | 0.9.26 | `search_mode`, `config`, `assets_sha256`, `seed`, `sample_seed`, `status`, `aborted_reason`, `model_endpoint`, `judge_endpoint`, `temperature`, `max_tokens`, `sessions_over_projection_limit`, `timeouts`, `metrics` for `accuracy`, `retrieval` and `retrieval_abstention` |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | `public`, `private` | `--attempts` `--repeat` `--model` `--akm` `--akm-env` | akm-cli 0.9.26, or what `--akm` names | `status`, `aborted_reason`, `completion`, `assets_sha256`, `engine`, `config`, and otherwise as `evals/agent-ab`, with `dataset` and `library` instead of its digest of the libraries |
| `benchmarks/skillret` | Given a request, does akm rank the right skills first from a large skill library (SkillRet)? | `public`, `private` | `--akm` | 0.9.26 | `search_mode`, `metrics` for the keyword and the semantic line, `by_size`, `curate_check`, `errored`, `timeouts`, `no_results`, `semantic_index`, `semantic_index_built_by`, `config`, `assets_sha256`, `seed` |

Reading the table:

- **Corpora.** `public` is the repository's own assets, or the dataset a benchmark fetches. `private` is a seeded rewrite of the public ones: see "Private assets". It is not held-out data. For `benchmarks/skillret` it is another split of the public data and is not rewritten, and for `benchmarks/terminal-bench` the tasks are Harbor's and only the library the akm arm reads is rewritten. For `evals/agent-ab` only the six tasks with made-up tools are rewritten. `own` is your own notes, which you set up in `private/<name>/own/` and which are never published. `all` runs `public` and `private` (or `own`) and prints them side by side, never as one number.
- **Flags.** Every `run` takes `--corpus`, `--limit` and `--label`. `--akm` is the command that runs akm, and for the two Harbor evals an `akm-cli@x.y.z` release or the folder of an akm checkout. `--model` is the model of the run, and `--judge-model` the judge. `--repeat N` runs the corpus N times. `--strategy` and `--config-patch` run another akm strategy, or another config, than the eval's own. `--embedder` and `--semantic` pick how akm embeds: see below. `--attempts` runs each Terminal-Bench task N times per arm. The flags of one eval only are in its README.
- **akm.** The lowest release the eval works with. "Or later" means the run stops on an older akm. A bare version is the one the eval was written for, which its README names, and no floor is checked. [`COMPATIBILITY.md`](COMPATIBILITY.md) has the range of each, the last release it was run on, the akm commands it runs, the JSON it reads and the parts of akm it relies on that akm does not promise.
- **Sampling.** The seven evals that run a model through akm (`judge-gate`, `reflect`, `distill`, `consolidate`, `extract`, `nightly` and `promotion`) set temperature 0 and thinking off in the engine of the config they write, and record it under `engine`.
- **What a summary records.** Each of those seven records `model`, `akm_version`, `akm_bin`, `akm_build`, `akm_build_fingerprint`, `limit`, `strategy`, `config_patch`, `config`, `engine`, `assets_sha256`, `seed`, `n_errored` and `metrics`, as well as what its row says. `config` is the akm config the eval wrote, with every `apiKey`, `api_key`, `token` and `secret` replaced by `<redacted>`. `config` names the model's endpoint: `judge-gate`, `extract`, `consolidate`, `nightly` and `reflect` write it as `<MODEL_BASE_URL>`, and `distill` and `promotion` keep the URL whole, so read it before you publish a summary. `engine` is that config's engine: `model`, the `endpoint` (its host and port only: never the path, which can name a deployment or carry a key), `endpoint_id` (a sha256 of the endpoint's identity, scheme, host, port and path with the credentials removed, which is what is compared), `temperature`, `enableThinking` and `timeoutMs`, and `engines`, the same settings of every engine the config uses, those a strategy, a process or a gate is routed to included (what the policy compares). `evals/reflect` also records a `manifest` (see "How results stay comparable"), and the other evals will. `assets_sha256` is one digest over the files a run read, wherever the repository is. `seed` is the private seed of a run on `private` assets, and null otherwise. Every eval and benchmark, those seven and the rest, records `status` (`complete` or `aborted`) and `aborted_reason`. A run that did not finish what it set out to do is `aborted`: it writes its summary, exits non-zero, and `scripts/matrix` never compares it. Every summary also records `harness_sha256`, a digest of the code the run used: the eval's own source files (with those of the evals whose code it imports: consolidate, distill and reflect for `nightly`, reflect for `extract`, retrieval for `terminal-bench`), every `.ts` and `.py` file under `lib/`, and `lib/env.sh` (for `bakeoff`, which uses nothing in `lib/`, its own Python files only). Tests, test doubles (`fakes.ts`), fixtures and READMEs are left out. It covers edits that are not committed, so two runs of different eval code are told apart even from a checkout with uncommitted changes. All but `nightly` count `timeouts`, the cases in which akm was killed for running past its time limit, apart from the other errors.
- **Which akm.** `evals/retrieval`, `evals/judge-gate`, `evals/reflect`, `evals/distill`, `evals/consolidate`, `evals/extract`, `evals/nightly`, `evals/promotion`, `benchmarks/longmemeval` and `benchmarks/skillret` run the akm on this machine and record `akm_version`, `akm_bin` and `akm_build`. The two Harbor evals record the three too, from `--akm`: `akm-cli@0.9.26` by default, and the checkout's `git describe` as `akm_build`. `evals/bakeoff` never runs akm, so it records no akm and has `prompts_version` instead.
- **judge-gate.** Its 106 cases are 11 good and 95 bad (67 harmful, 28 churn), labelled under rubric version 2, which the summary records as `rubric_version`. A summary with no `rubric_version` was scored under version 1, and results from version 1 do not compare with these.

Older evals and experiments that were retired instead of moved in are summarised in [`reports/retired-evals.md`](reports/retired-evals.md): what each asked, what it found, why it ended, and what covers the question now.

## Layout

```
README.md            this file
COMPATIBILITY.md     which akm each eval works with: range, commands, JSON fields, private surfaces
MEASUREMENT.lock     the version and digest of each eval's collector and scorer, and the harness version (see "How results stay comparable")
MEASUREMENT_CHANGELOG.md  one row for every change to what an eval measures
LICENSE              MPL-2.0, for everything here
NOTICE               third-party items under their own licences
package.json         the root package, with the scripts check, test and typecheck, and no dependencies
generate-assets      makes every eval's private assets in private/
.env.example         model and judge settings
.github/workflows/   check.yml on every push and pull request, akm-smoke.yml every night and on a pull request that changes the evals
corpus/library/      the shared akm bundle (a working akm library)
evals/               our evals
benchmarks/          published benchmarks
lib/akm/             the akm sandbox the evals that use akm share
lib/env.sh           the .env loader that every run, generate and label script and generate-assets source
lib/models.ts        --model, --judge-model and models.json: which model a run uses, and whether it may see your private notes
lib/negation.ts      the rule of negation that the checks of extract and distill share
lib/provenance.ts    the digests, the redacted akm config and the engine settings that go into summary.json
lib/manifest.ts      the run manifest in every summary.json, the lock, and the contract an eval declares itself by (MEASUREMENT)
lib/closure.ts       the files a measured part covers: the ones an eval lists and every file they import
lib/golden.ts        the golden tests of a scorer: raw outputs with the rows the scorer must give
lib/results.ts       the results folder of a run and its .running marker
lib/repeat.ts        --repeat
lib/harbor/          the akm arm, the job and the report of the evals that run opencode in Harbor with and without akm
lib/rewrite/         the seeded rewrite the generate scripts share
scripts/check        the typecheck of every src folder, the Python suites and bun test, as CI runs them
scripts/smoke/       runs each eval that drives akm once, on one case, against a stub model; --contract also checks that each reaches its outcome
scripts/matrix/      runs a matrix of eval configurations in two stages and writes a decision table
scripts/compare/     compares two results folders case by case, or the runs of a --repeat, and measures an eval's noise floor
scripts/rescore/     scores stored results folders again with the current scorer and labels, into new folders beside them
scripts/measurement/ checks MEASUREMENT.lock against the files of each eval, and bumps a part when it changes
reports/             notes, and the layout for published results (reports/README.md): scores only, never private items
retired/             code of retired evals, kept to read and never run here
private/             your private assets (gitignored, never published)
.cache/              akm's embedding model, downloaded once, and the semantic indexes the evals keep between runs (gitignored)
```

## Run an eval

Every eval and benchmark has a `run` script:

```
evals/retrieval/run --corpus public
evals/retrieval/run --corpus private
evals/retrieval/run --corpus own
evals/retrieval/run --corpus all
evals/retrieval/run --corpus public --semantic off
```

`--corpus` picks the assets. `all` runs both and shows the public and private results side by side. `--semantic on|off|auto` of `evals/retrieval` says whether the semantic search is scored too. The default, `auto`, scores it in a full run of the public and private corpora and not in a run with `--limit` or on `own`.

Models come from `.env`. Copy `.env.example` to `.env` and fill it in.

- `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME` set the model under test.
- `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL` set the judge.

Any OpenAI-compatible endpoint works, local or cloud, except for the two Harbor evals, which call the Responses API through opencode. `.env` is gitignored.

Every `run`, `generate` and `label` script, and `generate-assets`, reads `.env` through `lib/env.sh`, as KEY=value lines. A variable that is already set in your shell wins over `.env`, a line may start with `export `, and an unquoted value ends at a ` #` comment. A quoted value keeps its `#` characters.

### Pick the model and the akm build of a run

Point `.env` at one gateway, such as `MODEL_BASE_URL=https://gateway.example.com/v1`, and name the model of each run with `--model`, the gateway's model id. No script or environment override is needed to switch models:

```
evals/consolidate/run --corpus public --model my-cloud-model --repeat 3
evals/reflect/run --model my-small-model --akm "bun ~/code/akm/src/cli.ts" --label pr1100-1
benchmarks/longmemeval/run --model my-model --judge-model my-small-model
```

- `--model ID` is on every eval and benchmark that runs a model: all in the table but `evals/retrieval` and `benchmarks/skillret`, which call none. `--judge-model ID` is on the ones that grade with one (`benchmarks/longmemeval` and `evals/retrieval/label`). `--akm COMMAND` is on every one that runs akm on this machine, which is all but the two Harbor evals and `evals/bakeoff`. They win over `MODEL_NAME`, `JUDGE_MODEL` and `AKM_BIN`, which still work. `summary.json` records the model and the akm build.
- A judge takes the first of these that names an endpoint, and the key goes with it: a `models.json` line named by the judge id; `JUDGE_BASE_URL` with `JUDGE_API_KEY`; the endpoint and key of the model under test as the run resolved them, `--model` and its line included (`benchmarks/longmemeval`); `MODEL_BASE_URL` with `MODEL_API_KEY` of `.env` (`evals/retrieval/label`, which has no model under test). The header of `lib/models.ts` has the rule.
- A model that is not behind the gateway (another provider, a server of its own), or a gateway model that may see your private notes (a line with the gateway's `base_url`), takes a line in `models.json` beside `.env`, gitignored, copied from `models.example.json`: `{ "name": { "base_url": "...", "api_key_env": "OPENAI_API_KEY", "model": "...", "private": true } }`. `--model name` then goes to that URL with the key held in that environment variable (set it in `.env`). `model` is the name the endpoint expects, if it is not the line's name. A key never goes in `models.json`. `"private": true` says that your private notes may go to this model (see the private evals below); it is false when left out.
- In a matrix file, `"model"` and `"akm"` at the top set `--model` and `--akm` for every row (`model` not for retrieval, which uses none). A row's own `--model` or `--akm` in its `args` wins.
- `evals/bakeoff` takes `--model ID` like the others, and repeating it compares models. `--models FILE` stays for the request options of each model (temperature, max_tokens, seed, extra_body, timeout, retries), and an entry may name its model by `id`. It never runs akm: it scores a frozen snapshot of 0.9.15-style prompts, so it cannot register a change to akm, and it records `prompts_version` and `assets_sha256` and no akm build. Graph extraction, metadata enhancement and the reflect that rewrites the body are legacy cases, behind `--include-legacy`.
- `evals/agent-ab` and `benchmarks/terminal-bench` resolve `--model` like the others, a `models.json` line or else the gateway in `MODEL_BASE_URL` with `MODEL_API_KEY`, and give it to opencode as `OPENAI_BASE_URL` and `OPENAI_API_KEY`. The opencode form, `openai/<id>`, still works, and a base URL together with a model of another provider is refused. `OPENAI_BASE_URL` and `OPENAI_API_KEY` stand in for an empty `MODEL_BASE_URL` and `MODEL_API_KEY`, in any combination, and `MODEL_*` wins when both are set. Only the model's variables and Harbor's own reach Harbor.
- Their `--akm` is not a command. It is `akm-cli@x.y.z`, an exact release from npm, or the folder of an akm checkout, and the akm arm installs it in its container. `--akm-env KEY=VALUE`, repeatable, adds an `AKM_*` setting to that arm. `AKM_BIN` is not read by either, since it is a command on this machine; `benchmarks/terminal-bench` uses it only to count the library's assets, and holds the akm arm to that count only when the akm on this machine has the version the arm installs.
- `AKM_BIN` and `--akm` take a command line: words are separated by spaces, a word with spaces in it goes in double or single quotes (`AKM_BIN='bun "/tmp/my checkout/cli.ts"'` in `.env`; the outer quotes are the `.env` ones), a backslash outside quotes escapes the next character, and nothing is evaluated (no `$VAR`, no backticks). A word that starts with `~/` starts at your home folder, quoted or not (`\~/` keeps the `~`). The generate scripts read `.env` too, so `evals/retrieval/generate`, the one that runs akm, validates the private assets with the akm you set.

`nightly`, `consolidate`, `distill`, `reflect`, `promotion`, `extract` and `judge-gate` also take `--strategy NAME` and `--config-patch FILE`, to run an akm strategy or a config other than the eval's own; `summary.json` records both as `strategy` and `config_patch`. `nightly` and `consolidate` also take `--embedder deterministic|real`. The default, `deterministic`, is akm's word-hash embedder: no model, and the same pairs on every run. `real` is akm's built-in embedding model from `.cache/`, as a real bundle runs it. The cases were made to pair in the hash space, so the pairs and the retirements can differ with the embedder alone, and a `real` run is not comparable with a `deterministic` one. The summary records it as `embedder`.

Each eval's README says what else it needs. An eval with Python code needs [uv](https://docs.astral.sh/uv/). An eval that uses akm needs akm on `PATH`, or `AKM_BIN` set in `.env`. akm gets none of your environment's credentials: no variable whose name contains KEY, TOKEN, SECRET, PASSWORD, CREDENTIAL or AUTH, in any case, reaches it. The exceptions are the variables the akm config of the run names as `$NAME` (for example `$GROQ_KEY` from a config patch, or `$MODEL_API_KEY`). Each of those that is set reaches akm, and a variable the config does not name never does. Name a key in the config, not by a special variable name.

An eval that scores akm's semantic search, or has akm judge with embeddings, uses akm's built-in embedding model: `evals/retrieval` and `benchmarks/skillret` in a full run, `evals/promotion`, `benchmarks/longmemeval` with `--semantic`, and `evals/consolidate` and `evals/nightly` with `--embedder real`. akm downloads it (133 MB) the first time, into `.cache/`. `evals/retrieval` and `benchmarks/skillret` also keep the semantic index they build, in `.cache/akm-index/`, for the next run. `benchmarks/longmemeval` embeds the sessions of each question and keeps no index. A kept index is used only by the akm that built it: the same printed version, the same command, the same git build and the same uncommitted changes. Run a different build of akm, such as a branch you checked out, or a checkout with other changes, and a new index is built.

## Corpora

A run reads one of two corpora, or both:

- `public` is the cases committed in this repository (for a benchmark, the dataset it fetches). It is the default.
- `custom` is any folder of assets in the eval's format that has a corpus config, `corpus.json`. It is how you run your own notes, and it is also the public cases rewritten from a seed (see "Private assets"): that rewrite is one kind of custom corpus.

```
evals/distill/run                                # public
evals/distill/run --corpus custom                # the eval's default custom corpus: the seeded rewrite in private/distill/assets
evals/distill/run --cases ~/notes/distill        # a custom corpus of your own: --cases alone is --corpus custom
evals/distill/run --corpus all                   # public and the default custom corpus, side by side, never pooled
```

`--cases DIR` points an eval at your own folder. A relative `DIR` is from the repository root. The folder holds what the eval's README describes under "Run your own set", and a `corpus.json`. `--corpus all --cases DIR` runs `public` and `DIR`. The default custom corpus of an eval is the rewrite `./generate-assets` makes in `private/<eval>/assets`, and of `evals/promotion`, which has no generate, your notes in `private/promotion/own`.

### corpus.json

```
{ "kind": "own", "private": true }
{ "kind": "rewrite", "private": false, "seed": "42", "generated": "assets/generated.json" }
```

- `kind` is `own` (your notes) or `rewrite` (the public cases rewritten from a seed).
- `private` says whether the corpus may go only to a model and a judge that `models.json` marks `"private": true`. See below.
- `seed` and `generated` are for a rewrite only: the seed it was made with, written as text, and the path of the `generated.json` that generate wrote, from the folder of `corpus.json`. The seed has to be the one that file holds, so a rewrite made again by hand, with another seed, is refused until `./generate-assets` runs.
- Any other key is refused, so a typo such as `"privat"` cannot pass for a setting.
- `corpus.json` sits in the corpus folder, or beside it when the folder is called `assets`. `./generate-assets` writes `private/<eval>/corpus.json` beside `private/<eval>/assets/` and not inside it, because `evals/agent-ab` digests every file of its assets. No other folder is searched, so a `corpus.json` in a parent never applies to a folder next to it.
- **When there is none.** A folder given with `--cases` (or `--corpus custom` on an eval whose default is `own`) is an own corpus and is private: notes are kept from models you did not mark, not trusted. A rewrite at the place generate puts it, `private/<eval>/assets`, is not private, since it is derived from public cases; if it has no `corpus.json` (made before this file existed), its seed is read from its `generated.json`. To say that a folder of yours holds nothing private, give it a `corpus.json` with `"private": false`. `./generate-assets` keeps a `"private": true` it finds in an existing `corpus.json`.

### The private flag

A run on a corpus flagged private refuses, before anything runs, any model or judge whose line in `models.json` is not `"private": true`, including a gateway model with no line:

```
--cases ~/notes/distill sends your memories to other-model, which is not marked "private": true in models.json. The corpus is private: it has no corpus.json, and an own corpus without one is private. Mark the model in models.json if you run it or its provider does not keep or train on what it gets, or choose another with --model.
```

The same check covers `--judge-model` ("sends your notes to the judge ..."). `--corpus all` refuses the whole run when its custom corpus is private, so no public result is made and then thrown away. Nothing infers privacy from a URL or a name: you say which models may see your notes. The check is `privacyError` in `lib/corpus.ts`, built on `privateModelError` in `lib/models.ts`.

A summary of a custom run records `corpus: "custom"`, `corpus_kind` (`rewrite` or `own`), `corpus_private`, for a rewrite its `seed`, and `corpus_folder`: the corpus folder from the repository root, written with `/` (`private/reflect/assets`), when it is inside the repository, and `null` when it is anywhere else. It never records an absolute path, whose parts can say what is in the folder, and a public run records `null`. `scripts/rescore` reads the cases of a custom run from `corpus_folder`, and takes `--cases DIR` for a run whose folder is `null` (see "Rescore"). Results of a custom corpus are written under `private/`, which is gitignored.

### Old values

`--corpus private` (the seeded rewrite in `private/<eval>/assets`) and `--corpus own` (`private/<eval>/own`) work for one more release. Each prints one line that names the new form, for example `retrieval: --corpus own is now --corpus custom --cases private/retrieval/own. The old value works for one more release.`, and runs as the custom corpus it is, so a summary records `custom`, not `private` or `own`. An own corpus reached this way is private, as before. Summaries from before this change record `private` or `own`. `scripts/compare` and `scripts/matrix` read them as the custom corpus of that kind (`private` is a `rewrite`; `own` and distill's `own-feedback` are `own`), so an old run and a new one on the same corpus compare, and a rewrite is told from your own notes.


To run an eval against a checkout or a worktree of akm, set `AKM_BIN` to the command that runs it, in `.env` or for one run (a variable that is already set wins over `.env`):

```
AKM_BIN='bun ~/code/github/itlackey/akm/src/cli.ts' evals/retrieval/run --corpus public --label pr1071-1
```

Keep the quotes: the value has a space. bash leaves the `~` alone inside quotes, and the eval turns a leading `~/` into your home folder. Run `scripts/smoke/run --contract --akm 'bun ~/code/github/itlackey/akm/src/cli.ts'` first, and then the same with `--strict` in place of `--contract`, to see that akm's flags and JSON still fit the evals and that each eval still reaches its outcome.

`summary.json` records `akm_version`, which is the version akm prints, so a PR branch and the release it branched from can show the same one. It also records `akm_bin` (the `AKM_BIN` command, quoted as needed, with your home folder written as `~`), `akm_build` (`git describe --always --dirty` of the checkout that command runs from, or null for a release) and `akm_build_fingerprint`: a sha256 over the uncommitted changes (`git diff HEAD --binary` and the content of untracked files that are not ignored), or null for a clean checkout or a release. Two edits at one commit have the same `akm_build` and different fingerprints. The kept semantic index, `scripts/compare` and `scripts/matrix` (both its comparisons and its resume) treat the fingerprint as part of the build, so two edits at one commit are two builds. Commit before you measure all the same: a fingerprint says that two checkouts differ, not how.

Read those to tell two builds apart. `scripts/compare` and `scripts/matrix` refuse to compare runs of different builds unless the build is the declared treatment (`--treatment build` for compare, `"treatment": "build"` or a differing `--akm` in a matrix row). Every axis that is not the treatment (config, model, inputs, harness) must match, and where a summary lacks the evidence for one, the result is exploratory: see "What a comparison may differ in". Also put the build in `--label`, and keep a notes file next to the results of a set of runs, saying what each label tested. The results folder is `<UTC date>-<label>`: in the evening in the Americas the UTC date is already tomorrow's, and the same label on another day is another folder, so a glob on the label can match both.

The semantic index that `evals/retrieval` and `benchmarks/skillret` keep between runs is keyed on the same version, command, build and fingerprint of uncommitted changes. Its `state.json` in `.cache/akm-index/<name>/` records which akm built it (`version`, `akm_bin`, `akm_build`, `akm_build_fingerprint` when the checkout had uncommitted changes, `builtAt`), and the `summary.json` of a run that used a kept index has the same as `semantic_index_built_by`, beside `semantic_index`: `cold`, `warm` or `rebuilt`. When a kept index cannot be used, the run says why, such as `cannot be reused: ... it was built by akm X build A (...), and this run is akm X build B (...)`, and builds a new one.

A summary also records what the run was made of, so that two runs can be told apart: the effective akm `config` the eval wrote, with secrets redacted, `assets_sha256`, the private `seed` (null for the public assets), `harness_sha256` (the digest of the eval's code and of `lib/`), and for the evals that run a model, `engine`. `lib/provenance.ts` holds the helpers (`sha256Text`, `sha256File`, `sha256Files`, `harnessSha256`, `redactConfig`, `endpointIdentity` and `engineSettings`). A private summary holds the seed, which makes the private set again, so it stays in `private/` and does not go into `reports/` with the seed in it.

A command that akm does not finish in its time limit is killed, and the row says `akm <command> timed out after <N>s` and not an empty exit code. Most summaries count those apart as `timeouts`.

## Repeat a run

A model's answers differ by a case or two from one run to the next, so one run cannot tell a change from noise. `retrieval`, `judge-gate`, `reflect`, `distill`, `consolidate`, `extract`, `nightly`, `promotion`, `agent-ab` and `bakeoff` under `evals/`, and `benchmarks/terminal-bench`, take `--repeat N`, which runs the corpus N times, each a whole run into its own results folder, `<UTC date>-<label>-r1` to `-rN`, with the usual `summary.json`. Beside them it writes `<UTC date>-<label>-repeat-summary.json`: the same `metrics` as a summary, with every number replaced by its `min`, `max` and `mean` over the runs, and the same three for `n_errored`, `seconds` (the wall time of each run) and `timeouts` where the eval counts them, because a spread over runs that had errors misleads without them. `evals/bakeoff` has the spread of each model under `models`, and for a run of one model also at the top, and no `akm_*` keys. A run without `--repeat` is unchanged. With `--repeat` the side-by-side table of `--corpus all` is not printed; read each corpus's repeat summary. The code is `lib/repeat.ts`.

```
evals/promotion/run --corpus public --repeat 4 --label pr1071-2
```

A spread of min, max and mean cannot tell which cases changed. `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<label>` reads the runs `-r1` to `-rN` case by case and reports each case's flip rate and the eval's noise floor: the mean flip rate, which is how many cases change verdict between two runs of one configuration with nothing changed. A change that flips about that many cases is no change.

## How results stay comparable

akm-eval exists to say which of two akm builds is better: run akm A and akm B through the same eval and compare. A result loses that value when akm-eval itself changes and no earlier result can be compared with a new one. So a result has to stay comparable across changes to akm and across changes and fixes to akm-eval's own tools. This section is the design, and the contract an eval follows to be on it. `reflect` is the first eval on it; the others follow, and until one does its summaries are compared by the earlier rules (see "What a comparison may differ in").

### The three parts of a run

| Part | What it is | Its code |
|---|---|---|
| **Collection** | The cases go into a sandbox, akm is called with a config and a model, and akm's outputs come back. The only part that needs akm and a model. | The **collector**: the eval's run code that builds the sandbox, the akm config and its engine settings, the commands it runs, and `lib/akm`. |
| **Raw outputs** | Everything akm and the model returned for each case: the proposal, the lesson, the saved memory, the verdict, the search results, the akm JSON. | Stored with the run, in `samples.jsonl`. |
| **Scoring** | The checks turn each case's raw output, with the case's labels (expected outcomes, required and forbidden phrases, qrels), into a row, and the rows into metrics. Cheap, deterministic, no akm. | The **scorer**. |

Each kind of change invalidates only what it changes:

| Change | What it invalidates | What happens |
|---|---|---|
| The scorer, or the labels of a case (a scoring fix, a relabelled case) | No run. | Any stored run is **rescored** with the current scorer and labels (`scripts/rescore`). `scripts/compare` does it by itself when two runs were scored differently, and says so. |
| Cases added, removed, or given another input | Those cases only. | A comparison uses the cases whose input is the same in every run, and names the ones it left out. If more than a fifth of the shared cases differ in input, it is refused as a difference of inputs, unless `inputs` is the treatment. |
| The collector: the akm config the eval writes, the run procedure, engine settings such as the temperature, the sandbox, `lib/akm` | Earlier raw outputs: they are not comparable with later ones. | Explicit, versioned and gated. The collector has a version; a change to its files fails CI until the version is bumped with a line in `MEASUREMENT_CHANGELOG.md`; a comparison refuses two collector versions unless the collector is the declared treatment (`--treatment harness`). |
| The harness version | Every eval at once. | A deliberate break (`scripts/measurement/run bump harness`). Harness version 3 is this foundation. |

### The manifest

Every `summary.json` of an eval on the manifest has a `manifest` object (`lib/manifest.ts` types and validates it, and every reader of it, `scripts/compare`, `scripts/rescore` and the replay tools, goes through that one validator):

- `manifest_version`, `eval`, `corpus`, `collection`, `mode`: the scope. Runs of another eval, corpus, collection or mode (`consolidate --pool`) are never compared.
- `harness_version`, from `MEASUREMENT.lock`.
- `collector` and `scorer`: `{ version, sha256 }`, the version the lock records and the digest of the files the part covers (the ones the eval lists and the ones they import, see "The lock and the gate") as they were when the run started.
- `cases`: `{ id: { input_sha256, label_sha256 } }` for every case the run selected. `input_sha256` digests what the case presents to akm (reflect: the note, its path, the feedback, and the searches the run recorded for it). `label_sha256` digests what the scorer judges the case by.
- `akm`: `{ version, bin, build, build_fingerprint }`.
- `config`: `{ sha256, redacted }`: the akm config with secrets redacted and without the engine settings, which are in `engines`.
- `settings`: `{ strategy, config_patch_sha256, timeout_ms, seed }`, what a run was set to do that is not in the akm config.
- `engines`: `{ name: { model, endpoint, endpoint_id, temperature, enableThinking, timeoutMs } }` for every engine the config uses. `endpoint` is the host and `endpoint_id` a sha256 of `endpointIdentity` (scheme, host, port, path and the query with credentials removed). A path can name a deployment or carry a key, so no summary, comparison message or report carries one; two deployments on one host still have two ids. The validator refuses a manifest whose endpoint has a path.
- `treatment_hints`: settings that change what a run measures and belong to its scope, such as `embedder`. Runs that differ in one are refused whatever the treatment.
- `completion`: `{ selected, scored, errored }`, the case ids. A case counts only when it is scored on both sides.
- `rescored_from`: set only on a result of `scripts/rescore`.

A summary without a `manifest` is **legacy**: written before harness-v3. For an eval that declares a measurement it is compared only as exploratory, never silently.

### The lock and the gate

`MEASUREMENT.lock` records, for each eval on the manifest, the version, the digest and the list of files of its collector and of its scorer, and the `harness_version`. `scripts/measurement/run check` recomputes the digests and fails if one changed without the lock being updated, or if a version has no row in `MEASUREMENT_CHANGELOG.md`. `scripts/check` and CI run it. `bump` records a change:

```
scripts/measurement/run bump reflect scorer --reason "description-period: require that only the break changes (#59). Scores change."
scripts/measurement/run bump reflect collector --reason "no score change: the akm config writes the same engine in another order"
scripts/measurement/run list
```

It raises the version of that part by one, writes the digest and files, and adds the row. A pure refactor that keeps every score still changes the scorer digest: it must pass the golden tests, and be bumped with a reason that says "no score change". A relabelled case needs no bump: its `label_sha256` changes, and runs are rescored.

**What a part covers.** An eval lists the entry points of its collector and of its scorer, and a part covers those files and every file of the repository that they import, and those import. An edit to a helper that is only reached through an import (a function in `lib/` that decides which variables akm gets, say) changes what the part does as much as an edit to a listed file, so it changes the digest and fails the gate. The imports followed are `import ... from "./x.ts"`, `export ... from`, `import("./x.ts")` and `require("./x.ts")` (not a type-only import, which is gone when the code runs), and for Python `from .x import y` and a module next to the file. The `files` the lock records are the ones that were resolved, so a review sees exactly what a bump covers, and a new import shows in the check as "now also covers lib/x.ts". The collector stops at the scorer's files: a collector that calls `makeRow` from `score.ts` does not take the scorer's changes, which are the scorer's. The other way round is refused. `scripts/measurement/run check`, and the start of every run, fail when the scorer reaches a file the collector covers, because `scripts/rescore` runs the scorer without akm and a change to collector code must not change a scorer's digest. A file that both parts import is refused for the same reason: keep what the scorer needs in a file that only the scorer imports. Not followed are packages (their versions are in the lockfiles), a path built when the code runs (`join(import.meta.dir, "x.json")`) and a script started by its name; list such a file as an entry point.

### Rescore

```
scripts/rescore/run evals/reflect/results/2026-10-12-baseline
```

loads the eval's current scorer and the current cases, scores each stored case again from its raw output, and writes the result to a new folder beside the original (`2026-10-12-baseline-rescored`; `-rescored-r2` for the repeat `-r2`). The original is never modified. The new `summary.json` has the current scorer in its manifest, the original collector, and `rescored_from`. It refuses a run whose rows lack a field the scorer reads, and names the fields. A legacy run is rescored too, if it read the cases that are here now: its manifest is made from its summary, its collector is version 0 (identified by its `harness_sha256`), and a comparison with it is exploratory.

A run on the public corpus is scored against the committed cases. A run on a custom corpus is scored against the cases in the `corpus_folder` its summary records (a folder inside the repository, from the root). A folder anywhere else is not recorded, so name it, with the same meaning of a relative folder as the evals' `--cases` (from the repository root):

```
scripts/rescore/run --cases ~/notes/reflect evals/reflect/results/2026-10-12-notes
```

`--cases` applies to every folder given, so rescore the runs of one corpus together. It also names the cases of a run whose folder has moved, and the rescored summary records the folder it was scored against. Rescore refuses, and says what to do, when a custom run does not say where its cases are, or they are not there.

### Compare

`scripts/compare` reads the manifest. The collector and the harness version are the harness axis: different versions are refused unless `harness` is the treatment. Runs scored by different scorers, or against different labels, are scored again with the current scorer before they are compared; a run that cannot be (its rows lack the raw output) makes the comparison refused. Cases are paired by id and compared when their input is the same in every run. The report shows, for each side, the cases it scored out of the cases it selected, names the cases scored on one side only, and shows the number of cases beside each metric. A comparison that could use fewer than 80% of the cases both sides selected is exploratory. The build, config, model and engines are compared as before, read from the manifest. The corpus is `public` or `custom` with its kind (`rewrite` or `own`); older summaries that say `private` or `own` read as the custom corpus of that kind. See `scripts/compare/README.md`.

### After a change

What you do after a change depends on which part of the measurement it touched. Each row is one example; none re-runs akm unless the collector changed.

| You changed | Runs already made | What to run |
|---|---|---|
| **The scorer**: you fixed a check in an eval's `score.ts` and ran `scripts/measurement/run bump reflect scorer --reason "..."` | Still valid. Their stored rows are scored by the old scorer. | `scripts/rescore/run evals/reflect/results/2026-10-12-baseline` writes the run scored by the new one. You need not run it before comparing: `scripts/compare` and `scripts/matrix` score both sides again themselves when their scorers differ, and say so. |
| **A label**: you relabelled a case in `assets/cases.jsonl` | Still valid. The case's `label_sha256` differs from the one the run recorded, and no bump is needed. | `scripts/compare/run evals/reflect/results/2026-10-12-baseline evals/reflect/results/2026-10-13-pr` scores both sides again with the labels now, as it does for a scorer change. `scripts/rescore/run` on one folder names the relabelled cases (`N cases have other labels than when the run was made`). |
| **A case**: you added, removed or changed the input of a case | Valid for the cases whose input is the same. A case with another input is another case. | `scripts/compare/run evals/reflect/results/2026-10-12-baseline evals/reflect/results/2026-10-13-pr` compares the cases both ran with the same input and names the ones it left out (refused when more than a fifth differ; `--treatment inputs` compares all of them). The matrix has no way to leave a case out of a summary's numbers, so it says "not comparable" and names the cases: compare the runs with `scripts/compare`, or run the baseline again. |
| **The collector**: you changed the akm config an eval writes, its run procedure, its engine settings or `lib/akm`, and ran `scripts/measurement/run bump reflect collector --reason "..."` | Not comparable with runs made after. | Run the baseline again with the new collector: `scripts/matrix/run sweep.json --stage screen` runs the rows of the eval whose collector changed (for an eval that declares a measurement, the resume fingerprint holds its collector), and reuses the others. Compare a run from before it only as the treatment: `scripts/compare/run A B --treatment harness`. |

The matrix reads the same manifest. Its decision rows show the collector and the scorer version of each side, and it scores both sides again, in memory, when the sides were scored by different scorers or against different labels (it writes nothing; `scripts/rescore` is what writes a folder). A side that cannot be scored again, because its rows lack a raw output the scorer reads, makes the row "not comparable", with the fields named.

### To compare against a result from an older harness version

- A summary without `manifest`, made before harness-v3, compares as exploratory: the numbers are computed and the report says it is a lead.
- To bring it to today's scorer, rescore its folder (above) and compare the `-rescored` folder. Its collector is version 0, so a comparison with a run of collector version 1 is refused unless `harness` is the treatment, and then it is exploratory: nothing says what the unversioned code did.
- A result from an older harness version with raw outputs but a different collector is a result of a different measurement. Run it again.
- `reports/README.md` says how a published result stays comparable.

### Put an eval on the manifest

The contract is in the doc comments of `lib/manifest.ts`; `evals/reflect` is the example. For an eval `evals/<name>`:

1. **Split the scorer from the collector.** `src/score.ts` has `makeRow(case, raw)` and `metrics(rows)`, pure and deterministic. `src/collect.ts` builds the sandbox and the akm config, runs the commands, and builds each row with `makeRow`. A file belongs to one part, so that a scorer digest does not change when only collector code changes, and the other way round. Re-export both from `lib.ts` so imports do not move.
2. **Store the raw output.** Every field of the raw output that `makeRow` reads is stored in the case's row in `samples.jsonl`, under the name the scorer reads, and it is what akm and the model returned (an outcome, a proposal, a reason, a verdict, the search results), not a derived score. Reflect's raw output is `outcome`, `reason`, `proposal`, `served`, `seconds`, `error` and `timed_out`; its checks, `correct` and `changed` are scored from it. Where a row did not keep a field the scorer reads, the row now does.
3. **Declare `MEASUREMENT`** in `src/measurement.ts`, a `Measurement` (`lib/manifest.ts`):
   - `eval`, `collector` and `scorer`: the entry points, from the repository root, `lib/` files included; the files they import are covered too. The collector lists the run code and `lib/akm`; the scorer lists `score.ts` and the `lib/` files its checks use. The scorer must not import anything the collector covers.
   - `loadCases(root, summary)`, `caseId(case)`, `input(case, context)` and `labels(case)`: the cases with their labels as they are now, and the two values that are digested per case. `input` is everything that changes what akm sees, `context` what the run adds for a case (reflect: its recorded searches); `labels` is everything the scorer reads of the case.
   - the rescore adapter: `rawOf(row)` gives the raw output of a stored row, or the names of the fields it lacks; `score(case, raw)` is `makeRow`; `errored(row)` says a case has no verdict; `summarize(rows)` gives the summary fields that come from the rows (counts, `metrics`); `legacyProblem(root, summary)` (optional) says why a run from before the manifest cannot be scored against the cases here.
4. **Write the manifest** in `run.ts`: `lockedParts(MEASUREMENT)` at the start of the run, which stops it when the lock has no entry, then `buildManifest` with `caseDigests(MEASUREMENT, cases, context)`, `completionOf` and the config, into `summary.json`. Hide the endpoint in the summary's `config`, and record `engine: engineSettings(config)`.
5. **Golden tests** (`lib/golden.ts`): `evals/<name>/golden/` holds `cases.jsonl` (the labelled cases the outputs are for), `raw.jsonl` (`{case, note, raw}` per line: realistic raw outputs, from real runs where there are some, with the right answer and each way to get it wrong), `expected.jsonl` (the row the scorer must give for the line at the same position) and `scorer.json` (the scorer version they are for). `src/golden.test.ts` runs `goldenProblems`; a scorer change that alters a row fails it until `UPDATE_GOLDEN=1 bun test evals/<name>/src/golden.test.ts` writes the files again, which the scorer's version bump asks for.
6. **Add the lock entry:** `scripts/measurement/run bump <name> collector --reason "first lock entry"` writes both parts at version 1 and their rows in the changelog.
7. Add the eval's metrics to `EVALS` in `scripts/matrix/src/lib.ts` and its per-case reading to `scripts/compare/src/lib.ts`, if they are not there.
8. **Tests read the lock; they do not copy it.** A bump is a routine change, so no test may hold a collector or scorer version, a harness version or a digest of the live lock as a literal. A test that needs one reads it from `lockedParts(MEASUREMENT)` (`.collector.version`, `.scorer.sha256`, `.harness_version`), and a test that needs *another* version uses the live one plus one. A golden test is the exception that is meant: `golden/scorer.json` holds the scorer version the expected rows are for, so a scorer bump fails it until `UPDATE_GOLDEN=1` writes the rows again.

## Run a matrix

`scripts/matrix/run` runs a baseline and a list of configurations of the evals, and says which configurations beat the baseline. It is for comparing akm settings, strategies or builds, and for checking a change against the last good run. It holds no configuration of its own: the matrix file, and the config patches it names, live wherever you keep them (a sweep folder under `private/`, for one).

```json
{
  "prefix": "sweep",
  "model": "my-cloud-model",
  "baseline": [
    { "name": "base", "eval": "reflect" },
    { "name": "base-pool", "eval": "consolidate", "args": ["--pool"] }
  ],
  "configs": [
    { "name": "low-value", "eval": "reflect", "args": ["--config-patch", "patches/low-value.json"] },
    { "name": "short-budget", "eval": "consolidate", "args": ["--pool", "--timeout-ms", "150000"] }
  ],
  "screen": { "limit": { "reflect": 20 } },
  "repeats": 3
}
```

`args` are the eval's own flags. A relative `--config-patch` path is from the matrix file's folder. Leave out `--label` and `--repeat`: the runner sets them. A config is compared with the baseline that runs the same cases (the same eval, corpus, `--pool` and `--limit`; the corpus is `public`, or `custom` with its folder, which `--cases DIR` or an old `--corpus` value names, so `--corpus private` and `--corpus custom` are the same corpus for an eval whose default custom corpus is the rewrite), so give one baseline per eval and mode; the corpora are never pooled. `screen.limit` is a number for every eval, or one per eval, and does not apply to `--pool` runs. `repeats` is the number of runs of each side in the confirm stage (default 3), and at least 3: a verdict needs that many runs of each side. The model and the akm build are the run's own: `.env` and `AKM_BIN`, or the file's top-level `"model"` and `"akm"`, which become `--model` and `--akm` of every row (see "Pick the model and the akm build of a run"). A row's `eval` is an eval of `evals/` or a benchmark of `benchmarks/`: `terminal-bench` is the one benchmark in `EVALS`. A config row may add `"treatment"`, the axes it changes against its baseline (see "What a comparison may differ in").

```
scripts/matrix/run sweep.json --stage screen                  # every row once, label <prefix>-<name>-s
scripts/matrix/run sweep.json --stage confirm                 # --repeat 3 for the rows that differ, label <prefix>-<name>-c
scripts/matrix/run sweep.json --stage confirm --only low-value
scripts/matrix/run sweep.json --stage report
```

`--parallel N` runs rows of different evals at the same time; two runs of one eval never overlap. A stage skips a row it already ran only when nothing the row was made from has changed, so a stopped sweep resumes and an edited one does not reuse a stale result (see "When a stage resumes"); `--force` runs it again. `--dry-run` prints what a stage would run. `--only A,B` confirms the named configs whatever the screen said. `--min-delta X` sets how much a screen result must move to count as different; see "Choose `--min-delta`" below.

A stage exits 1 when a job failed: its process exited non-zero, it wrote no summary, or its summary does not say `status: "complete"` (or has results missing from its `completion`). The artifacts and the log of a failed job are kept and `state.json` records its exit code, but its result is used for nothing: it is not compared with a baseline, no verdict is drawn from it, and the confirm stage does not select it. Its row in the decision is "no result", with the reason and the log. A job that failed is run again by the next stage.

Each stage writes `decision.md` and `decision.json`, beside `state.json` and the runs' `logs/`, in `<matrix name>-results/` next to the matrix file (or `--out`). One row per config: the main metrics and the harm metrics, baseline against config, as mean and min-max over the repeats, the cases scored (of the cases given, with the errored ones), the model calls and seconds, the akm build and the model, the collector and scorer version of each side (when the runs have a manifest), the paired comparison (confirm stage), and a verdict. The registry `EVALS` in `scripts/matrix/src/lib.ts` declares, for each eval, its main metrics, its harm metrics and its completeness policy, and `EVAL_METRICS` lists them with the direction of each. Main metrics: nightly `items.rate`; consolidate (also `--pool`) `recall.value` and `precision.value`; distill `good_lessons.rate` and `lesson_updates.rate`; reflect `defects.rate`; promotion `precision.value` and `recall.value`; judge-gate `precision.value` and `good.rate`; extract `insights.rate`; retrieval `ndcg_10` of each column, per collection (the row also shows `ndcg_10_condensed`, over the judged results only, and `judged_10`; the matrix does not judge on them, but a fall in `judged_10` makes the verdict exploratory, see the decision rule); agent-ab and terminal-bench `delta.value`. Harm metrics, which must not rise: nightly `harm.items`, `harm.outside_changed`, `harm.lessons_accepted` and `calls.failures`; consolidate `unsafe.n`; distill `wrong_lessons.rate`; reflect `controls.rate` falling and `proposals.touched_body`; promotion `bad_accepted.value`; judge-gate `bad_harmful.rate` and `bad_churn.rate`, each on its own, since a harmful revision that is passed is not made up for by fewer passed churn revisions; extract `routine.rate` falling and `planted.saved_instruction`; agent-ab and terminal-bench `akm.errored` and `engagement.control_calls`. `planted.saved_instruction` counts the planted instruction saved with a condition or a hedge as well, so its values are not comparable with runs of an earlier extract. The completeness policy of every eval is that a config whose errored cases (`n_errored`) are above its baseline's can never be "better"; for the Harbor evals the tasks that failed (`completion.failed`) count too. The two sides must also have scored the same cases (see the decision rule).

`scripts/compare` computes the interval of those same metrics per case, so a metric can be read with an interval and not only as a range over the repeats. To see which cases a change moved, compare two results folders of the same eval, corpus and akm build, or, with `--treatment build`, of two builds:

```
scripts/compare/run evals/nightly/results/<baseline folder> evals/nightly/results/<change folder> [--treatment AXES] [--json FILE] [--md FILE]
```

It lists the cases that agree, flipped to better and flipped to worse, with ids, an exact sign test on the cases that disagree, and a paired bootstrap 95% interval on each metric the matrix judges. A different strategy, config patch or model is what is compared unless you name the axes with `--treatment`; a different eval, corpus, collection or anything else outside the treatment is refused. See `scripts/compare/README.md`. A results folder published under `reports/` works as a baseline: see [`reports/README.md`](reports/README.md).

The decision rule is the plan's for akm's 0.10 defaults, one rule for every metric, main or harm. A metric is better (worse) when the config's min-max range over the repeats lies wholly on the better (worse) side of the baseline's, and the gap between the two ranges is at least 1.25 times the wider of them (`GAP_FACTOR` in `scripts/matrix/src/lib.ts`). A metric that is the same in every repeat has ranges of no width, so any difference between two such sides is a gap. A harm metric whose mean is higher but whose range overlaps the baseline's has not risen: an earlier rule read that as a rise, and called a configuration that had not changed "worse" about two times in three. The rule needs repeats: with three a side, a seeded simulation of a judge-gate run (`scripts/matrix/src/lib.test.ts`) gives "better" or "worse" for a configuration that did not change under 3% of the time, and "better" for a large gain in `good.rate` with harm unchanged more than half the time. Three repeats are little for a small change, which reads "no difference"; the paired column is where to look for it. A decision written before this rule, with its looser harm rule and two repeats allowed, is not comparable with these verdicts.

- better: a main or a harm metric better (a harm metric whose range is clearly lower counts), and none worse;
- worse: a main metric clearly below, or a harm metric clearly above the baseline's, and none better. Harm must not rise;
- mixed: both a better and a worse metric;
- no difference: neither;
- incomplete: the config would be better, but more of its cases errored than the baseline's (or more of its Harbor tasks failed), so its rates are over fewer cases. The note gives the counts. A config with more errors is never "better";
- screen only: a run with one repeat. A screen cannot tell a change from noise, so it only picks what to confirm;
- no result: a run wrote no scored summary, exited non-zero, or was not complete. An eval that gives up (the endpoint down or rate limiting, no case getting a verdict) writes its summary first, with `status: "aborted"` and an `aborted_reason`, and its numbers cover only the cases that ran; the matrix reads that as no result, and the row's note gives the reason and the log. One run of a repeat that was not complete makes the whole repeat no result;
- not comparable: the baseline and the config differ on an axis that is not the row's treatment, in any run of either (see "What a comparison may differ in"). The note names which. For runs with a manifest that includes a collector version, a case given another input in some run (the note names the cases), and runs that cannot be scored by one scorer (the note names the raw output their rows lack);
- exploratory: the numbers are there and the verdict they would give is in the note (`the metrics read: ...`), but it is not a conclusion. The reason is in the note: a summary lacks the evidence that the runs differ only in the treatment (a missing `assets_sha256`, akm config or engine, or an eval commit that is dirty or missing), or a run has no manifest although its eval declares a measurement (written before harness-v3); a side has fewer than three repeats; the two sides did not score the same cases; or, for retrieval, `judged_10` fell. Rerun with the evidence, or read it as a lead.

The two sides must have scored the same cases. Two sides with as many errored cases can have failed on different ones: a config that errors on two hard cases the baseline scored, and scores two easy ones the baseline errored on, has a higher rate over cases that are not the baseline's. The decision reads the cases each side gave a verdict (the rows of each run's `samples.jsonl`, read as `scripts/compare` reads them; a case counts for a side when at least one of its repeats gave it a verdict) and, when they differ, the row is exploratory and its note names the cases only the baseline scored and those only the config scored. `decision.json` has them as `cases` (`baseline_only`, `config_only`). The `scored` column of the table, and `coverage` in `decision.json`, give for each side the cases that got a verdict of the cases it was given, per run (the mean over the repeats), and how many errored (as the summary counts them: nightly scores an errored item as failed, so there it is scored and errored). An eval that `scripts/compare` has no per-case reading of (the Harbor evals) has no `scored` figure and only the counts of errored cases and failed tasks.

Retrieval's qrels judge what akm 0.9.26's keyword search and BM25 returned, and `ndcg_10` counts a result nobody graded as not relevant. A config that surfaces more ungraded results reads worse for it, however good they are. So a retrieval row whose `judged_10` (the share of the first 10 results that someone graded) fell against its baseline's, in any column, is exploratory, and its note says to label the config's results first (`evals/retrieval/label --from <its results folder>`, see `evals/retrieval/README.md`) and compare again. The row shows `ndcg_10_condensed`, the nDCG over the judged results alone, and `judged_10` beside each `ndcg_10`; the matrix does not judge on either.

### What a comparison may differ in

Two runs differ along five axes, and a comparison names the ones it changes, its treatment. Every other axis must be the same in every run of both sides, and in every repeat of a side, not only the first:

| axis | what it is | recorded as |
|---|---|---|
| `build` | the akm | `akm_version`, `akm_build`, `akm_build_fingerprint`, `akm_bin` |
| `config` | the akm config the eval wrote | `strategy`, `config_patch` (its hash), a digest of `config`, `timeout_ms` |
| `model` | the model and its engine | `model`, and in `engine.engines` the model, endpoint (its digest `endpoint_id`, and its host), temperature, `enableThinking` and `timeoutMs` of every engine used |
| `inputs` | the cases | `assets_sha256`, and the `seed` of a rewrite. For runs with a manifest, the `input_sha256` of each case they share instead |
| `harness` | this repository's code | `harness_sha256` when both runs have it, else a clean `git_commit`. For runs that all have a manifest (`scripts/compare` and the matrix): the collector's version and digest and the harness version, so a scorer fix or a label change is no difference |

The digest of `config` leaves out the engine settings, which belong to the model axis. The scope is not an axis and no treatment changes it: the eval, the corpus (`public` or `custom`) and, for a custom one, its kind (`rewrite` or `own`), the collection, the mode (`consolidate --pool`) and the `embedder` of `consolidate` and `nightly`, since a run with `--embedder real` and one with `--embedder deterministic` pair notes in different spaces. Runs that differ in the scope are "not comparable". A `git_commit` that ends in `-dirty`, is `unknown` or is missing does not identify the code. A difference on an axis outside the treatment makes the verdict "not comparable". A summary that does not record the evidence for an axis outside the treatment (none of the two sides has it, or one) makes it "exploratory", never a conclusion. The Harbor evals run in a container: for them the `config` axis is the job (`config`, without the datasets and attempts, the model, and the akm and plugin under test, which are the cases, the model and the build) with the AKM_* settings of the akm arm (`akm_env`), and the `engine` is the model and the identity of its endpoint; a summary without them leaves the axis unchecked, like any other eval's. The policy is `scripts/compare/src/policy.ts`, which `scripts/compare` and the matrix both apply.

Results made before a change to a scorer, a label, a case or a collector are still usable, or not, as "After a change" under "How results stay comparable" says, with an example command for each.

A config row's treatment is `"treatment": "model"`, `"treatment": ["config", "build"]` and so on, from `build`, `config`, `model`, `inputs` and `harness`. A row that runs another `--akm` than its baseline has the build axis as well. A row that declares nothing and runs the same akm has the config axis. A model sweep therefore needs `"treatment": "model"`; the matrix does not guess it from `--model`.

A summary is also asked to say that its run finished: `status: "complete"`, no `completion.missing`, and, without a `--limit`, every case run. A summary that does not is no result in the matrix, and makes a comparison made by `scripts/compare` exploratory.

### Compare akm builds

A config row whose `--akm` is not its baseline's compares two builds of akm, the way to test a branch against `main`, or a release against the next one:

```json
{
  "prefix": "pr1071",
  "model": "my-cloud-model",
  "baseline": [{ "name": "main", "eval": "nightly", "args": ["--akm", "bun ~/code/akm/src/cli.ts"] }],
  "configs": [{ "name": "pr", "eval": "nightly", "args": ["--akm", "bun ~/code/akm-pr1071/src/cli.ts"] }]
}
```

The same goes for a row with `"treatment": "build"`, for a command that is the same in both rows but runs another build when it runs, such as a checkout you switch branches in between the stages. The `"akm"` at the top of the file is the same for both rows and is not a treatment. A build treatment is compared across builds and versions, since a checkout of a pre-release prints the version of the release it branched from, or another one: the table shows the baseline's build and the config's in its akm build column, and the row in `decision.json` has `treatment` (the list of axes), `baseline_akm_build`, `akm_build`, the two versions and the two `akm_build_fingerprint`s. Everything else must still be the same: the model and its engine settings, the akm config, the cases (`assets_sha256`) and this repository's code. So a release and the next release compare when the config and the code are common, in the screen, the confirm and the paired column alike. A note says when both rows of a build treatment ran the same build: the same `akm_build`, version and `akm_build_fingerprint`. Two edits of one commit have the same `akm_build` (it ends in `-dirty`) and two fingerprints, so they are two builds, and the table shows each with the first characters of its fingerprint (`abc1234-dirty (1a2b3c4d) → abc1234-dirty (5e6f7a8b)`). A release shows its version (`release 0.9.30 → release 0.9.31`). Commit before you measure all the same: a fingerprint says that two checkouts differ, not how.

### The Harbor evals and terminal-bench

`agent-ab` (of `evals/`) and `terminal-bench` (of `benchmarks/`) run opencode with and without the akm plugin in Harbor. Their rows are like the others', with their own flags: `--akm` is an npm release (`akm-cli@0.9.27`) or the folder of a checkout, `--akm-env KEY=VALUE` sets a setting or a strategy for the akm arm, `--attempts N` (terminal-bench) runs each task N times, and `--repeat` and `--limit` work as for the other evals. The file's top-level `"akm"` is a command, so it is not passed to them: name `--akm` in the row of a baseline or a config that needs a release or a checkout. `--model` is passed as for the others. The main metric is `delta.value`, the akm arm's pass rate minus the control's, paired by task; harm is `akm.errored`, akm trials that never got a verdict, and `engagement.control_calls`, control trials that called akm, which has no plugin there. Their summaries say how much of the job finished in `completion` (`expected`, `completed`, `failed`, `missing`): a run with tasks missing is no result, and a config with more failed tasks than its baseline is never "better". `scripts/compare` has no per-case reading of their trials, so their rows have no paired comparison.

### Paired comparison of the repeats

Three runs of 20 to 60 cases vary too much for their min-max ranges to separate except for a large effect, and the cases are the same in every run. So in the confirm stage, when both sides are repeat runs, the decision also compares them case by case with `scripts/compare` (`scripts/compare/README.md`). All the repeats of both sides are pooled: a case is scored by its mean over the repeats of a side (right in two of three repeats is 2/3), a metric is the mean of the eval's metric over the repeats, and the interval is a bootstrap over the cases, the case being the unit that is resampled. The order of the repeats, in the folders or in the repeat summary, changes nothing. The row's `paired` holds the number of repeats pooled on each side (`repeats`), the cases whose mean outcome is higher in the config (`better`), lower (`worse`) and the same (`agree`), the sign test on the flips (`p`) and `ci`: each metric as config minus baseline, with the 95% interval of the bootstrap over the cases that both sides gave a verdict. The table shows the same as a paired column.

The verdict stays the min-max rule's. A row that is `no difference` while a main or a harm metric's paired interval excludes 0 says `paired says different` in its note, with the metric and its interval. The reverse is flagged too: a row that is better, worse or mixed by the ranges, with a metric that moved whose paired interval includes 0, says `the ranges say better and the paired interval includes 0`, with the metric and its interval. That is a conclusion that one or two cases may carry. Read it with the flips and the sign test: about one interval in twenty crosses 0 by chance, there are several metrics, and the interval is over the cases, not over the model's own variation. It needs each run's `samples.jsonl`. It applies the row's treatment, so a build sweep between versions has a paired comparison when the rest is common.

To see which cases a change moved outside a matrix, compare two results folders as above, or two sets of repeats: `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<baseline label> --against evals/nightly/results/<UTC date>-<change label> [--treatment AXES]`. It lists the cases that agree, flipped to better and flipped to worse, with their ids, and the same sign test and intervals.

### When a stage resumes

A stage skips a row only when its last run exited 0, its result files still exist and can be read, the result is complete, and its fingerprint is the same as now. The fingerprint, stored in `state.json` with the run, covers the row's arguments; the bytes of every file they name (`--config-patch`, and every file of a `--cases` folder); the corpus the row reads, which is every file of the folders its eval opens for its `--corpus` (`public`, `custom`, `all`, or the old `private`, `own` and `own-feedback`; for `terminal-bench`, the library it takes from the custom rewrite of `evals/retrieval`): for a custom corpus the folder it resolves to as `lib/corpus.ts` does (`--cases DIR`, the folder of an old value, or the eval's default), the `corpus.json` and the `generated.json` beside a folder called `assets`, and `private/seed` for an own corpus, each by its path from the repository root (a folder elsewhere by its last name) and its bytes, so a regeneration, another seed, a changed `private` flag or an edited input runs the row again wherever the checkout is (the `results/` a run writes are not inputs; the labels are among the bytes, so a relabelled case runs the row again, though a stored result needs no new run to be compared); the model settings the run sees, which are `MODEL_NAME`, the endpoint of `MODEL_BASE_URL`, `JUDGE_MODEL` and the endpoint of `JUDGE_BASE_URL` from the environment or `.env` (each as `endpointIdentity` in `lib/provenance.ts` writes it: scheme, host, port and path, with no credentials), and the digest of `models.json` (never a key), and for a Harbor eval the endpoint of `OPENAI_BASE_URL` too, which stands in for an empty `MODEL_BASE_URL`; the akm, which is `--akm` or `AKM_BIN`, the build that command identifies (`akm_build` and `akm_build_fingerprint`) and the version it prints (`--version`, which is what tells an upgraded release from the one before it, since a release has no build; for a Harbor eval the release it names or the build of the checkout); and the code of the eval. For an eval that declares a measurement and has a lock entry that is its collector as the run's manifest records it: the harness version, and the version and the digest of the files of the collector in `MEASUREMENT.lock` (`lockedParts` in `lib/manifest.ts`), and not its scorer, so a scorer fix, a bump of another eval or a commit elsewhere leaves a finished row as it is. For every other eval it is this repository's code, which is `git HEAD` and a digest of `git diff HEAD` for the changes to tracked files that are not committed. Editing a patch in place, regenerating the private assets, pointing `MODEL_BASE_URL` or `JUDGE_BASE_URL` at another host or at another deployment path on the same host, switching the akm checkout to another commit, upgrading the installed akm, pointing a Harbor row's `OPENAI_BASE_URL` at another deployment or changing an eval's collector runs the row again, and the stage says which of these changed. A byte-identical invocation with an unchanged corpus resumes. A state file from before the fingerprint, or from before it covered the corpus, cannot vouch for what its rows read, so they run once more.

### Choose `--min-delta`

The confirm stage runs the baseline and the configs whose screen result differs from their baseline's. `--min-delta X` is how far a main or harm metric of the screen must move to differ, in the metric's own unit (a rate, or a count for harm such as `unsafe.n`). The default is 0, which selects any change, and a model's runs differ by a case or two with nothing changed, so it selects nearly every config. A screen that failed, or that differs from its baseline on an axis outside the row's treatment, is not selected. To pick X from the evals' own noise:

- The confirm stage prints, before it selects, the **noise floor** of each baseline it has already confirmed, measured with `scripts/compare` on that baseline's repeats. It is the mean flip rate, the share of the cases whose verdict changes between two runs of one configuration, and the same as a number of cases (`about 5.3 of 20 cases flip`); then how far a main metric moves on average between two runs (the mean difference over the pairs of runs, the largest of the main metrics), as the `--min-delta` to start from. A matrix has no floor until a first confirm has run its baselines; measure one earlier by running the baseline with `--repeat 3` and `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<label>`, which finds `<label>-r1` to `-rN` (`--collection` names a retrieval collection). The repeats must be one configuration in every axis, so a floor is refused for runs that differ in their engine settings or the code they ran.
- Take X at that figure or above: a screen result that moves less than two runs of the same configuration do carries no signal. Three runs give three pairs, so the figure is rough; repeat more for a firmer one.
- X applies to every metric of every eval in the file. A rate moves in fractions and a count in whole numbers, so a count of harm that moves by one is selected for any X below 1. To use another X for each eval, confirm them in turn: `--stage confirm --only A,B --min-delta X`.
- Retrieval's repeats are close to the same run by construction (the same index and grades), so its floor is about 0 and tells you little about a change.

## Stop or wait for a run

While a run is alive, its results folder holds a `.running` file with the pid of the process that writes it, and the process removes the file when it ends, however it ends (a failure, Ctrl-C, `kill`). Every eval and benchmark that makes a results folder does this (`lib/results.ts`, and the same few lines in `evals/bakeoff`). A run that ends removes its own marker, also under `--corpus all`, where several runs share one process. With `--repeat`, each folder loses its file when that run is done, so a script that waits for `-r1` sees it end while `-r2` runs. `benchmarks/longmemeval --resume` marks the folder again.

```
kill $(cat evals/promotion/results/<UTC date>-<label>/.running)         # stop the run
while [ -e evals/promotion/results/<UTC date>-<label>/.running ]; do sleep 10; done   # wait for it
```

A run that was killed with `kill -9`, or by a power cut, leaves the file behind: `kill -0 $(cat <dir>/.running)` fails when no such process is alive. A folder with no `.running` and no `summary.json` is a run that stopped before it wrote its result. A folder whose `summary.json` says `status: "aborted"` is a run that did not finish what it set out to do: it gave up early, on a rate limit or after several cases in a row that got no result, or, for the Harbor evals, some of its trials have no result. Its `aborted_reason` says which. Its numbers are partial and it is not a result: do not compare it.

## Check the repository

```
scripts/check              # the four below, quickest first, and it stops at the first that fails
scripts/check measurement  # MEASUREMENT.lock against the files of every eval's collector and scorer (scripts/measurement/run check)
scripts/check typecheck    # bun install --frozen-lockfile and tsc in every src folder that has a tsconfig.json
scripts/check python       # the bakeoff suite (verify and unittest) and the Harbor arm's tests, with uv
scripts/check test         # bun test at the root
```

`bun run check`, `bun run typecheck` and `bun test` do the same from the root `package.json`, which has no dependencies and no workspaces: each src folder keeps its own `package.json` and `bun.lock`, so the pins of `typescript` and `@types/bun` are repeated in every one of them: change them in all, and the `bun-version` of the two workflows with them. No test needs akm or Docker, since every test uses a fake akm. The check of the table in this README runs `evals/bakeoff/run --help`, which is Python and needs uv: `bun test` skips those three tests on a machine without uv, and where uv has no cache yet it fetches PyYAML, once, from the network. `scripts/check python` needs uv in any case. `.github/workflows/check.yml` runs `scripts/check` on every push and pull request. The measurement check fails a change to the collector or the scorer of an eval that is not bumped in `MEASUREMENT.lock` with a line in `MEASUREMENT_CHANGELOG.md` (see "How results stay comparable"), so a change to `lib/akm` or to an eval's run code or checks needs a `scripts/measurement/run bump`.

The fakes cannot see a change in the real akm. `scripts/smoke/run` runs each eval that drives akm once, on one case, with `--limit 1 --label smoke`, against a stub model, in two modes. The startup mode, the default, answers `{}` to every call and asserts only that the run ends and writes a `summary.json`. The point is not the scores: it is that the commands the evals give akm are still accepted. It cannot see the JSON akm prints after the model has answered, since the `{}` makes those cases error anyway; `retrieval`, which calls no model, is checked on its answers instead, and `scripts/smoke/run --strict` fails when its `search` or `curate` returns no ref. The contract mode, `scripts/smoke/run --contract`, answers each call with a reply that fits the schema akm sends, with canned replies where akm turns that down, and fails unless every eval reaches the outcome it counts as its work, such as a reflect proposal or a lesson queued for review. It then answers text that is not JSON and requires the outcome the eval has for a reply akm cannot read. Both modes skip what needs Docker (`agent-ab`, `terminal-bench`), what downloads a dataset (`longmemeval`, `skillret`) and `bakeoff`, which never runs akm. `.github/workflows/akm-smoke.yml` runs it every night, and on demand: the contract mode on the release of akm-cli pinned in `lib/harbor/harbor.ts` (a leg that must pass) and the startup mode with `--strict` on the latest release (advisory). A pull request that changes the evals or what they share runs the pinned contract leg. [`COMPATIBILITY.md`](COMPATIBILITY.md) says what has been run against which release.

## Run from a worktree

A new git worktree of this repository has no `.env` (gitignored) and no `private/` link, so `run` fails until you copy the first and link the second:

```
cp ~/code/github/itlackey/akm-eval/.env .env
ln -s ~/code/github/itlackey/akm-eval/private private
```

Public results are written inside the worktree, under `evals/<name>/results/`, and removing the worktree removes them. Commit them to akm-eval-private or copy them out first. Private and own results are written through the link, to `private/`, and stay there uncommitted until you commit them. Results that other people have to check go under `reports/`: see `reports/README.md`.

## Private assets

Private assets are a seeded perturbation of the public ones, made by the rewrite in `lib/rewrite`: a few percent of the words change, so memorised text is less recognisable. They are not held-out data. The prose, the structure and the labels are those of the public assets, which sit in a public repository, and a model that has memorised a case can still recognise it. The rewrite changes:

- names, and the names of tools, products and projects (Docker, GitHub, Qwen, akm), in every form they are written (`bun lib/rewrite/rewrite.ts --tools keep` leaves the real tools as they are and renames only the made-up ones; the generate scripts rename them, except that `evals/retrieval` keeps `akm` and the executables its library runs, and `evals/agent-ab` rewrites only its tasks with made-up tools);
- hosts, addresses, ports, ids and dates;
- numbers and versions, such as counts, sizes, durations and percentages. Each keeps its order relative to the others, its digits and its range, so "up from 18 to 21" stays an increase and a percentage stays between 0 and 100.

It leaves the ordinary prose, the words a text rests on (programming languages, file formats, protocols, operating systems and core commands: Python, TypeScript, JSON, YAML, Markdown, HTTP, SQL, git, npm, bash), single digits, years, HTTP status codes, process exit codes, the units of time 7, 12, 24, 60 and 365, the keys of the PDF and PDF/X standards, step and list numbers, and hosts under well-known domains. Every label, case and expected answer goes through the same mapping as its text, so the meaning stays the same. The difficulty stays the same only when the real tools keep their names (`--tools keep`), because a model that no longer knows a renamed tool finds the case harder. The `generate` of each eval whose labels depend on the text checks that they still hold. `lib/rewrite/README.md` has the full lists.

Most of a text is prose, so a private copy differs from its public one by a few percent of its words: about 1.5 to 5 percent for the evals (1.6 percent for retrieval's library, and 3.5 percent if its tools were renamed too), about 1 percent for LongMemEval, which keeps its numbers (`--keep-values`) because its answers are counted from the text.

```
./generate-assets                          # make private assets for every eval
./generate-assets --only retrieval,nightly # make them for some evals
./generate-assets --seed 42                # use this seed for one run
```

The first run creates `private/` and `private/seed`, a random 64-bit integer. `private/` is gitignored. It is never published, so never commit it or upload it. The `summary.json` of a private run holds the seed. `benchmarks/longmemeval` records the rewrite seed from `generated.json` beside the assets (`seed`, a string) and the seed of its question sample (`sample_seed`, null when every question is asked). Do not publish a private summary with the seed in it (see `reports/README.md`).

Each eval's `generate` script gets `--seed <seed> --out private/<name>`. The scripts share the rewrite in `lib/rewrite`. It needs [bun](https://bun.sh). `evals/retrieval`, `evals/consolidate`, `evals/nightly`, `evals/distill`, `evals/reflect`, `evals/judge-gate`, `evals/extract`, `evals/bakeoff`, `evals/agent-ab` and `benchmarks/longmemeval` write into a temporary folder first (`private/<name>/.new` for consolidate and nightly), and move the result into place only when their checks pass, so a failed generation changes nothing. They also write `generated.json`, in `private/<name>/` (in its `assets/` folder for retrieval, judge-gate and agent-ab), with the `seed` and `inputs_sha256`, a digest of the public inputs. The manifests of retrieval and distill also hold `rewrite`, a digest of the code that made the assets, and `run` checks it, so a change to that code makes their assets stale. The manifests of agent-ab and longmemeval also hold a `version`, a `generator_sha256` (the digest of the generator's code) and an `outputs_sha256` (the digest of the files generate wrote), and `run` checks all three, so a changed generator, or a file edited afterwards, makes their assets stale. `run --corpus private` refuses assets that have no `generated.json` or were made from other public inputs, and says to run `./generate-assets --only <name>`. Private sets made before this check have to be made again.

A private set that has been published, or sent to a training API, is burned. Delete `private/seed`, run `./generate-assets` again, and treat the results on the new set as a new series.

Run private evals on a local model, or on an API that does not train on your data. A run on your own notes (`--corpus own`, `own-feedback`, or `--cases`) uses a model only if its line in `models.json` says `"private": true`, and refuses any other, including a gateway model with no line. Nothing infers it from a URL or a name: you say which models may see your notes. A model may have seen the public assets in training. A gap between the public and private scores points to that only when the real tools keep their names (`--tools keep`). With the default, a gap also measures how much harder a renamed tool is to read, and no gap does not show that the model has not seen the cases, because the labels and the prose are unchanged. That holds for `evals/judge-gate`, too: its private corpus is a light rewrite of the public cases, so a gap there is not evidence of contamination.

## Licence

Everything here, code and assets alike, is MPL-2.0. See `LICENSE`. The few third-party items keep their own licences and are listed in `NOTICE`. Third-party benchmark data is fetched when you run the benchmark; it is never committed here and stays under its own licence.

## Use the library as an akm bundle

`corpus/library` is a working akm bundle. Add this repository to an agent's akm config as a git bundle, with the component root set to `corpus/library` and the adapter set to `akm`:

```json
{
  "bundles": {
    "akm-eval-library": {
      "git": "https://github.com/itlackey/akm-eval.git",
      "components": { "main": { "root": "corpus/library", "adapter": "akm" } }
    }
  }
}
```

The agent then reads the library's skills, knowledge, commands, agents and workflows through akm refs. See `corpus/library/README.md` for what it holds and what each agent supplies in its own stash.
