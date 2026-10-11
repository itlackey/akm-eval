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
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | `public`, `private` | `--repeat` `--retrieval-queries` `--strategy` `--config-patch` `--model` `--akm` | 0.9.25-alpha.3 or later | `metrics` for `defects`, `controls`, `proposals`, `refused` and `classes`; `served`; `retrieval_queries`; `status`, `aborted_reason`, `timeouts` |
| `evals/distill` | Do distilled lessons say only what the source memory says? | `public`, `private`, `own`, `own-feedback` | `--repeat` `--strategy` `--config-patch` `--model` `--akm` | 0.9.26 (the `lesson-update` class needs 0.10.0) | `metrics` for `good_lessons`, `wrong_lessons`, `lesson_updates`, `by_class`, `outcomes`; `served_models`; `status`, `aborted_reason`, `timeouts` |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | `public`, `private` | `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` `--pool` `--timeout-ms` | 0.9.26 | `metrics` for `unsafe`, `precision`, `recall`, `classes` (with `--pool` also `pairs`, `calls`, `chunks`); `embedder`, `n_paired`, `served_models`; `status`, `aborted_reason`, `timeouts` |
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
- **What a summary records.** Each of those seven records `model`, `akm_version`, `akm_bin`, `akm_build`, `akm_build_fingerprint`, `limit`, `strategy`, `config_patch`, `config`, `engine`, `assets_sha256`, `seed`, `n_errored` and `metrics`, as well as what its row says. `config` is the akm config the eval wrote, with every `apiKey`, `api_key`, `token` and `secret` replaced by `<redacted>`. `config` names the model's endpoint: `judge-gate`, `extract`, `consolidate` and `nightly` write it as `<MODEL_BASE_URL>`, and `reflect`, `distill` and `promotion` keep the URL whole, so read it before you publish a summary. `engine` is that config's engine: `model`, the `endpoint` host and port, `temperature`, `enableThinking` and `timeoutMs`. `assets_sha256` is one digest over the files a run read, wherever the repository is. `seed` is the private seed of a run on `private` assets, and null otherwise. Every eval and benchmark, those seven and the rest, records `status` (`complete` or `aborted`) and `aborted_reason`. A run that did not finish what it set out to do is `aborted`: it writes its summary, exits non-zero, and `scripts/matrix` never compares it. Every summary also records `harness_sha256`, a digest of the code the run used: the eval's own source files (with those of the evals whose code it imports: consolidate, distill and reflect for `nightly`, reflect for `extract`, retrieval for `terminal-bench`), every `.ts` and `.py` file under `lib/`, and `lib/env.sh` (for `bakeoff`, which uses nothing in `lib/`, its own Python files only). Tests, test doubles (`fakes.ts`), fixtures and READMEs are left out. It covers edits that are not committed, so two runs of different eval code are told apart even from a checkout with uncommitted changes. All but `nightly` count `timeouts`, the cases in which akm was killed for running past its time limit, apart from the other errors.
- **Which akm.** `evals/retrieval`, `evals/judge-gate`, `evals/reflect`, `evals/distill`, `evals/consolidate`, `evals/extract`, `evals/nightly`, `evals/promotion`, `benchmarks/longmemeval` and `benchmarks/skillret` run the akm on this machine and record `akm_version`, `akm_bin` and `akm_build`. The two Harbor evals record the three too, from `--akm`: `akm-cli@0.9.26` by default, and the checkout's `git describe` as `akm_build`. `evals/bakeoff` never runs akm, so it records no akm and has `prompts_version` instead.
- **judge-gate.** Its 106 cases are 11 good and 95 bad (67 harmful, 28 churn), labelled under rubric version 2, which the summary records as `rubric_version`. A summary with no `rubric_version` was scored under version 1, and results from version 1 do not compare with these.

Older evals and experiments that were retired instead of moved in are summarised in [`reports/retired-evals.md`](reports/retired-evals.md): what each asked, what it found, why it ended, and what covers the question now.

## Layout

```
README.md            this file
COMPATIBILITY.md     which akm each eval works with: range, commands, JSON fields, private surfaces
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
lib/provenance.ts    the digests, the redacted akm config and the engine settings that go into summary.json
lib/results.ts       the results folder of a run and its .running marker
lib/repeat.ts        --repeat
lib/harbor/          the akm arm, the job and the report of the evals that run opencode in Harbor with and without akm
lib/rewrite/         the seeded rewrite the generate scripts share
scripts/check        the typecheck of every src folder, the Python suites and bun test, as CI runs them
scripts/smoke/       runs each eval that drives akm once, on one case, against a stub model; --contract also checks that each reaches its outcome
scripts/matrix/      runs a matrix of eval configurations in two stages and writes a decision table
scripts/compare/     compares two results folders case by case, or the runs of a --repeat, and measures an eval's noise floor
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

## Test an unreleased akm

To run an eval against a checkout or a worktree of akm, set `AKM_BIN` to the command that runs it, in `.env` or for one run (a variable that is already set wins over `.env`):

```
AKM_BIN='bun ~/code/github/itlackey/akm/src/cli.ts' evals/retrieval/run --corpus public --label pr1071-1
```

Keep the quotes: the value has a space. bash leaves the `~` alone inside quotes, and the eval turns a leading `~/` into your home folder. Run `scripts/smoke/run --contract --akm 'bun ~/code/github/itlackey/akm/src/cli.ts'` first, and then the same with `--strict` in place of `--contract`, to see that akm's flags and JSON still fit the evals and that each eval still reaches its outcome.

`summary.json` records `akm_version`, which is the version akm prints, so a PR branch and the release it branched from can show the same one. It also records `akm_bin` (the `AKM_BIN` command, quoted as needed, with your home folder written as `~`), `akm_build` (`git describe --always --dirty` of the checkout that command runs from, or null for a release) and `akm_build_fingerprint`: a sha256 over the uncommitted changes (`git diff HEAD --binary` and the content of untracked files that are not ignored), or null for a clean checkout or a release. Two edits at one commit have the same `akm_build` and different fingerprints. The kept semantic index, `scripts/compare` and `scripts/matrix` (both its comparisons and its resume) treat the fingerprint as part of the build, so two edits at one commit are two builds. Commit before you measure all the same: a fingerprint says that two checkouts differ, not how.

Read those to tell two builds apart. `scripts/compare` and `scripts/matrix` refuse to compare runs of different builds unless the build is the declared treatment (`--treatment build` for compare, `"treatment": "build"` or a differing `--akm` in a matrix row). Every axis that is not the treatment (config, model, inputs, harness) must match, and where a summary lacks the evidence for one, the result is exploratory: see "What a comparison may differ in". Also put the build in `--label`, and keep a notes file next to the results of a set of runs, saying what each label tested. The results folder is `<UTC date>-<label>`: in the evening in the Americas the UTC date is already tomorrow's, and the same label on another day is another folder, so a glob on the label can match both.

The semantic index that `evals/retrieval` and `benchmarks/skillret` keep between runs is keyed on the same version, command, build and fingerprint of uncommitted changes. Its `state.json` in `.cache/akm-index/<name>/` records which akm built it (`version`, `akm_bin`, `akm_build`, `akm_build_fingerprint` when the checkout had uncommitted changes, `builtAt`), and the `summary.json` of a run that used a kept index has the same as `semantic_index_built_by`, beside `semantic_index`: `cold`, `warm` or `rebuilt`. When a kept index cannot be used, the run says why, such as `cannot be reused: ... it was built by akm X build A (...), and this run is akm X build B (...)`, and builds a new one.

A summary also records what the run was made of, so that two runs can be told apart: the effective akm `config` the eval wrote, with secrets redacted, `assets_sha256`, the private `seed` (null for the public assets), `harness_sha256` (the digest of the eval's code and of `lib/`), and for the evals that run a model, `engine`. `lib/provenance.ts` holds the helpers (`sha256Text`, `sha256File`, `sha256Files`, `redactConfig` and `engineSettings`). A private summary holds the seed, which makes the private set again, so it stays in `private/` and does not go into `reports/` with the seed in it.

A command that akm does not finish in its time limit is killed, and the row says `akm <command> timed out after <N>s` and not an empty exit code. Most summaries count those apart as `timeouts`.

## Repeat a run

A model's answers differ by a case or two from one run to the next, so one run cannot tell a change from noise. `retrieval`, `judge-gate`, `reflect`, `distill`, `consolidate`, `extract`, `nightly`, `promotion`, `agent-ab` and `bakeoff` under `evals/`, and `benchmarks/terminal-bench`, take `--repeat N`, which runs the corpus N times, each a whole run into its own results folder, `<UTC date>-<label>-r1` to `-rN`, with the usual `summary.json`. Beside them it writes `<UTC date>-<label>-repeat-summary.json`: the same `metrics` as a summary, with every number replaced by its `min`, `max` and `mean` over the runs, and the same three for `n_errored`, `seconds` (the wall time of each run) and `timeouts` where the eval counts them, because a spread over runs that had errors misleads without them. `evals/bakeoff` has the spread of each model under `models`, and for a run of one model also at the top, and no `akm_*` keys. A run without `--repeat` is unchanged. With `--repeat` the side-by-side table of `--corpus all` is not printed; read each corpus's repeat summary. The code is `lib/repeat.ts`.

```
evals/promotion/run --corpus public --repeat 4 --label pr1071-2
```

A spread of min, max and mean cannot tell which cases changed. `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<label>` reads the runs `-r1` to `-rN` case by case and reports each case's flip rate and the eval's noise floor: the mean flip rate, which is how many cases change verdict between two runs of one configuration with nothing changed. A change that flips about that many cases is no change.

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

`args` are the eval's own flags. A relative `--config-patch` path is from the matrix file's folder. Leave out `--label` and `--repeat`: the runner sets them. A config is compared with the baseline that runs the same cases (the same eval, `--corpus`, `--pool`, `--cases` and `--limit`), so give one baseline per eval and mode; the corpora are never pooled. `screen.limit` is a number for every eval, or one per eval, and does not apply to `--pool` runs. The model and the akm build are the run's own: `.env` and `AKM_BIN`, or the file's top-level `"model"` and `"akm"`, which become `--model` and `--akm` of every row (see "Pick the model and the akm build of a run"). A row's `eval` is an eval of `evals/` or a benchmark of `benchmarks/`: `terminal-bench` is the one benchmark in `EVALS`. A config row may add `"treatment"`, the axes it changes against its baseline (see "What a comparison may differ in").

```
scripts/matrix/run sweep.json --stage screen                  # every row once, label <prefix>-<name>-s
scripts/matrix/run sweep.json --stage confirm                 # --repeat 3 for the rows that differ, label <prefix>-<name>-c
scripts/matrix/run sweep.json --stage confirm --only low-value
scripts/matrix/run sweep.json --stage report
```

`--parallel N` runs rows of different evals at the same time; two runs of one eval never overlap. A stage skips a row it already ran only when nothing the row was made from has changed, so a stopped sweep resumes and an edited one does not reuse a stale result (see "When a stage resumes"); `--force` runs it again. `--dry-run` prints what a stage would run. `--only A,B` confirms the named configs whatever the screen said. `--min-delta X` sets how much a screen result must move to count as different; see "Choose `--min-delta`" below.

A stage exits 1 when a job failed: its process exited non-zero, it wrote no summary, or its summary does not say `status: "complete"` (or has results missing from its `completion`). The artifacts and the log of a failed job are kept and `state.json` records its exit code, but its result is used for nothing: it is not compared with a baseline, no verdict is drawn from it, and the confirm stage does not select it. Its row in the decision is "no result", with the reason and the log. A job that failed is run again by the next stage.

Each stage writes `decision.md` and `decision.json`, beside `state.json` and the runs' `logs/`, in `<matrix name>-results/` next to the matrix file (or `--out`). One row per config: the main metrics and the harm metrics, baseline against config, as mean and min-max over the repeats, the model calls and seconds, the akm build and the model, the paired comparison (confirm stage), and a verdict. The registry `EVALS` in `scripts/matrix/src/lib.ts` declares, for each eval, its main metrics, its harm metrics and its completeness policy, and `EVAL_METRICS` lists them with the direction of each. Main metrics: nightly `items.rate`; consolidate (also `--pool`) `recall.value` and `precision.value`; distill `good_lessons.rate` and `lesson_updates.rate`; reflect `defects.rate`; promotion `precision.value` and `recall.value`; judge-gate `precision.value` and `good.rate`; extract `insights.rate`; retrieval `ndcg_10` of each column, per collection (the summary also has `ndcg_10_condensed`, over the judged results only, which the matrix does not judge on); agent-ab and terminal-bench `delta.value`. Harm metrics, which must not rise: nightly `harm.items`, `harm.outside_changed`, `harm.lessons_accepted` and `calls.failures`; consolidate `unsafe.n`; distill `wrong_lessons.rate`; reflect `controls.rate` falling and `proposals.touched_body`; promotion `bad_accepted.value`; judge-gate `bad_harmful.rate` and `bad_churn.rate`, each on its own, since a harmful revision that is passed is not made up for by fewer passed churn revisions; extract `routine.rate` falling and `planted.saved_instruction`; agent-ab and terminal-bench `akm.errored` and `engagement.control_calls`. `planted.saved_instruction` counts the planted instruction saved with a condition or a hedge as well, so its values are not comparable with runs of an earlier extract. The completeness policy of every eval is that a config whose errored cases (`n_errored`) are above its baseline's can never be "better"; for the Harbor evals the tasks that failed (`completion.failed`) count too.

`scripts/compare` computes the interval of those same metrics per case, so a metric can be read with an interval and not only as a range over the repeats. To see which cases a change moved, compare two results folders of the same eval, corpus and akm build, or, with `--treatment build`, of two builds:

```
scripts/compare/run evals/nightly/results/<baseline folder> evals/nightly/results/<change folder> [--treatment AXES] [--json FILE] [--md FILE]
```

It lists the cases that agree, flipped to better and flipped to worse, with ids, an exact sign test on the cases that disagree, and a paired bootstrap 95% interval on each metric the matrix judges. A different strategy, config patch or model is what is compared unless you name the axes with `--treatment`; a different eval, corpus, collection or anything else outside the treatment is refused. See `scripts/compare/README.md`. A results folder published under `reports/` works as a baseline: see [`reports/README.md`](reports/README.md).

The decision rule is the plan's for akm's 0.10 defaults:

- better: a main metric's min-max range over the repeats does not overlap the baseline's, on the better side, and no harm metric rose (a harm metric whose range is clearly lower also counts as better);
- worse: a main metric clearly below, or a harm metric above the baseline's mean (harm must not rise);
- mixed: both a better and a worse metric;
- no difference: neither;
- incomplete: the config would be better, but more of its cases errored than the baseline's (or more of its Harbor tasks failed), so its rates are over fewer cases. The note gives the counts. A config with more errors is never "better";
- screen only: a run with one repeat. A screen cannot tell a change from noise, so it only picks what to confirm;
- no result: a run wrote no scored summary, exited non-zero, or was not complete. An eval that gives up (the endpoint down or rate limiting, no case getting a verdict) writes its summary first, with `status: "aborted"` and an `aborted_reason`, and its numbers cover only the cases that ran; the matrix reads that as no result, and the row's note gives the reason and the log. One run of a repeat that was not complete makes the whole repeat no result;
- not comparable: the baseline and the config differ on an axis that is not the row's treatment, in any run of either (see "What a comparison may differ in"). The note names which;
- exploratory: the numbers are there and the verdict they would give is in the note, but a summary lacks the evidence that the runs differ only in the treatment (a missing `assets_sha256`, akm config or engine, or an eval commit that is dirty or missing). It is not a conclusion: rerun with the evidence, or read it as a lead.

### What a comparison may differ in

Two runs differ along five axes, and a comparison names the ones it changes, its treatment. Every other axis must be the same in every run of both sides, and in every repeat of a side, not only the first:

| axis | what it is | recorded as |
|---|---|---|
| `build` | the akm | `akm_version`, `akm_build`, `akm_build_fingerprint`, `akm_bin` |
| `config` | the akm config the eval wrote | `strategy`, `config_patch` (its hash), a digest of `config`, `timeout_ms` |
| `model` | the model and its engine | `model`, and in `engine` the temperature, `enableThinking`, endpoint host and `timeoutMs` |
| `inputs` | the cases | `assets_sha256`, and the private `seed` |
| `harness` | this repository's code | `harness_sha256` when both runs have it, else a clean `git_commit` |

The digest of `config` leaves out the engine settings, which belong to the model axis. A `git_commit` that ends in `-dirty`, is `unknown` or is missing does not identify the code. A difference on an axis outside the treatment makes the verdict "not comparable". A summary that does not record the evidence for an axis outside the treatment (none of the two sides has it, or one) makes it "exploratory", never a conclusion. The Harbor evals run in a container and record no akm config or engine, so those two are not asked of them. The policy is `scripts/compare/src/policy.ts`, which `scripts/compare` and the matrix both apply.

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

The same goes for a row with `"treatment": "build"`, for a command that is the same in both rows but runs another build when it runs, such as a checkout you switch branches in between the stages. The `"akm"` at the top of the file is the same for both rows and is not a treatment. A build treatment is compared across builds and versions, since a checkout of a pre-release prints the version of the release it branched from, or another one: the table shows the baseline's build and the config's in its akm build column, and the row in `decision.json` has `treatment` (the list of axes), `baseline_akm_build`, `akm_build` and the two versions. Everything else must still be the same: the model and its engine settings, the akm config, the cases (`assets_sha256`) and this repository's code. So a release and the next release compare when the config and the code are common, in the screen, the confirm and the paired column alike. A note says when both rows of a build treatment ran the same build. A checkout with changes that are not committed counts as one build, whatever the changes are (its `akm_build` ends in `-dirty`), so commit before you measure.

### The Harbor evals and terminal-bench

`agent-ab` (of `evals/`) and `terminal-bench` (of `benchmarks/`) run opencode with and without the akm plugin in Harbor. Their rows are like the others', with their own flags: `--akm` is an npm release (`akm-cli@0.9.27`) or the folder of a checkout, `--akm-env KEY=VALUE` sets a setting or a strategy for the akm arm, `--attempts N` (terminal-bench) runs each task N times, and `--repeat` and `--limit` work as for the other evals. The file's top-level `"akm"` is a command, so it is not passed to them: name `--akm` in the row of a baseline or a config that needs a release or a checkout. `--model` is passed as for the others. The main metric is `delta.value`, the akm arm's pass rate minus the control's, paired by task; harm is `akm.errored`, akm trials that never got a verdict, and `engagement.control_calls`, control trials that called akm, which has no plugin there. Their summaries say how much of the job finished in `completion` (`expected`, `completed`, `failed`, `missing`): a run with tasks missing is no result, and a config with more failed tasks than its baseline is never "better". `scripts/compare` has no per-case reading of their trials, so their rows have no paired comparison.

### Paired comparison of the repeats

Three runs of 20 to 60 cases vary too much for their min-max ranges to separate except for a large effect, and the cases are the same in every run. So in the confirm stage, when both sides are repeat runs, the decision also compares them case by case with `scripts/compare` (`scripts/compare/README.md`). All the repeats of both sides are pooled: a case is scored by its mean over the repeats of a side (right in two of three repeats is 2/3), a metric is the mean of the eval's metric over the repeats, and the interval is a bootstrap over the cases, the case being the unit that is resampled. The order of the repeats, in the folders or in the repeat summary, changes nothing. The row's `paired` holds the number of repeats pooled on each side (`repeats`), the cases whose mean outcome is higher in the config (`better`), lower (`worse`) and the same (`agree`), the sign test on the flips (`p`) and `ci`: each metric as config minus baseline, with the 95% interval of the bootstrap over the cases that both sides gave a verdict. The table shows the same as a paired column.

The verdict stays the min-max rule's. A row that is `no difference` while a main or a harm metric's paired interval excludes 0 says `paired says different` in its note, with the metric and its interval. Read it with the flips and the sign test: about one interval in twenty crosses 0 by chance, there are several metrics, and the interval is over the cases, not over the model's own variation. It needs each run's `samples.jsonl`. It applies the row's treatment, so a build sweep between versions has a paired comparison when the rest is common.

To see which cases a change moved outside a matrix, compare two results folders as above, or two sets of repeats: `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<baseline label> --against evals/nightly/results/<UTC date>-<change label> [--treatment AXES]`. It lists the cases that agree, flipped to better and flipped to worse, with their ids, and the same sign test and intervals.

### When a stage resumes

A stage skips a row only when its last run exited 0, its result files still exist and can be read, the result is complete, and its fingerprint is the same as now. The fingerprint, stored in `state.json` with the run, covers the row's arguments; the bytes of every file they name (`--config-patch`, and every file of a `--cases` folder); the corpus the row reads, which is every file of the folders its eval opens for its `--corpus` (`public`, `private`, `own`, `own-feedback` or `all`; for `terminal-bench`, the library it takes from the private assets of `evals/retrieval`), the `generated.json` of private assets, and `private/seed` for an own corpus, each by its path from the repository root and its bytes, so a regeneration, another seed or an edited input runs the row again wherever the checkout is (the `results/` a run writes are not inputs); the model settings the run sees, which are `MODEL_NAME`, the endpoint of `MODEL_BASE_URL`, `JUDGE_MODEL` and the endpoint of `JUDGE_BASE_URL` from the environment or `.env` (each as `endpointIdentity` in `lib/provenance.ts` writes it: scheme, host, port and path, with no credentials), and the digest of `models.json` (never a key); the akm, which is `--akm` or `AKM_BIN` and the build that command identifies (`akm_build`; for a Harbor eval the release it names or the build of the checkout); and this repository's code, which is `git HEAD` and a digest of `git diff HEAD` for the changes to tracked files that are not committed. Editing a patch in place, regenerating the private assets, pointing `MODEL_BASE_URL` or `JUDGE_BASE_URL` at another host or at another deployment path on the same host, switching the akm checkout to another commit or changing an eval runs the row again, and the stage says which of these changed. A byte-identical invocation with an unchanged corpus resumes. A state file from before the fingerprint, or from before it covered the corpus, cannot vouch for what its rows read, so they run once more.

### Choose `--min-delta`

The confirm stage runs the baseline and the configs whose screen result differs from their baseline's. `--min-delta X` is how far a main or harm metric of the screen must move to differ, in the metric's own unit (a rate, or a count for harm such as `unsafe.n`). The default is 0, which selects any change, and a model's runs differ by a case or two with nothing changed, so it selects nearly every config. A screen that failed, or that differs from its baseline on an axis outside the row's treatment, is not selected. To pick X from the evals' own noise:

- The confirm stage prints, before it selects, the **noise floor** of each baseline it has already confirmed, measured with `scripts/compare` on that baseline's repeats. It is the mean flip rate, the share of the cases whose verdict changes between two runs of one configuration, and the same as a number of cases (`about 5.3 of 20 cases flip`); then how far a main metric moves between two runs, as the `--min-delta` to start from. A matrix has no floor until a first confirm has run its baselines; measure one earlier by running the baseline with `--repeat 3` and `scripts/compare/run --repeats evals/nightly/results/<UTC date>-<label>`, which finds `<label>-r1` to `-rN` (`--collection` names a retrieval collection). The repeats must be one configuration in every axis, so a floor is refused for runs that differ in their engine settings or the code they ran.
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
scripts/check              # the three below, quickest first, and it stops at the first that fails
scripts/check typecheck    # bun install --frozen-lockfile and tsc in every src folder that has a tsconfig.json
scripts/check python       # the bakeoff suite (verify and unittest) and the Harbor arm's tests, with uv
scripts/check test         # bun test at the root
```

`bun run check`, `bun run typecheck` and `bun test` do the same from the root `package.json`, which has no dependencies and no workspaces: each src folder keeps its own `package.json` and `bun.lock`, so the pins of `typescript` and `@types/bun` are repeated in every one of them: change them in all, and the `bun-version` of the two workflows with them. No test needs akm or Docker, since every test uses a fake akm. The check of the table in this README runs `evals/bakeoff/run --help`, which is Python and needs uv: `bun test` skips those three tests on a machine without uv, and where uv has no cache yet it fetches PyYAML, once, from the network. `scripts/check python` needs uv in any case. `.github/workflows/check.yml` runs `scripts/check` on every push and pull request.

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
