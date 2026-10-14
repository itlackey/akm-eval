# akm-eval

Evals and benchmarks for [akm](https://github.com/itlackey/akm), as a set of scripts. Each one runs akm on a set of cases, scores what akm returns, and saves the results. Compare compatible saved runs with `scripts/compare` or explore published quality and performance in the ledger. Runs are single by default; repeats are optional.

Most evals run against any OpenAI-compatible model, local or cloud. `evals/retrieval` and `benchmarks/skillret` call no model. `evals/agent-ab` and `benchmarks/terminal-bench` run opencode in Docker through Harbor.

## Evals and benchmarks

Every folder below has a `run` script. Every `run` takes `--corpus`, `--limit` and `--label`; the table lists the other flags. `run --help` explains each, and each folder's README says how a case is scored and what the summary reports. [`COMPATIBILITY.md`](COMPATIBILITY.md) says which akm each one runs on.

| Folder | Question it answers | Flags |
|---|---|---|
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | `--cases` `--yes` `--repeat` `--akm` `--semantic` |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | `--cases` `--yes` `--repeat` `--retrieval-queries` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/distill` | Do distilled lessons say only what the source memory says? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | `--cases` `--yes` `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` `--pool` `--timeout-ms` `--semantic` |
| `evals/extract` | Does extraction pull durable insights from session logs, and leave routine sessions empty? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/nightly` | Does a full nightly improve run give good results unattended? | `--cases` `--yes` `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/promotion` | Of the promotions consolidate proposes, does the drain's judgment tier accept the good ones? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--semantic` |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | `--cases` `--yes` `--repeat` `--model` `--akm` `--akm-env` `--semantic` |
| `evals/bakeoff` | Does the model do what akm asks in the jobs no other eval measures? | `--cases` `--yes` `--process` `--repeat` `--config-patch` `--model` `--akm` `--semantic` |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | `--cases` `--yes` `--repeat` `--sample-seed` `--retrieval-only` `--semantic` `--resume` `--model` `--judge-model` `--akm` |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | `--attempts` `--cases` `--yes` `--repeat` `--model` `--akm` `--akm-env` `--semantic` `--resume` `--concurrency` |
| `benchmarks/skillret` | Does akm rank the right skills first in a large skill library (SkillRet)? | `--repeat` `--akm` |

`scripts/smoke/src/readme.test.ts` runs every `run --help` and fails when this table lists other flags.

- **What a summary records.** Each run writes `summary.json` and `samples.jsonl` (one row per case, with akm's raw output). The seven evals that run a model through akm record `model`, `akm_version`, `akm_bin`, `akm_build`, `akm_build_fingerprint`, `limit`, `strategy`, `config_patch`, `config` (the akm config the eval wrote), `engine` (the model and the host of its endpoint, never the path), `assets_sha256`, `seed`, `n_errored` and `metrics`. Every eval that calls a model through akm also records `model_calls`, from akm's own record of each call: `calls`, `errors`, and per successful call the mean `prompt_tokens`, `completion_tokens` and `seconds`, with `output_tokens_per_second`. akm does not stream, so a call's time includes its prefill: prefill and decode are not told apart. Every summary has a `manifest` (`lib/manifest.ts`), which is what compare reads, and a `status` of `complete` or `aborted`. A config value is written as `<redacted>` when its key ends in key, token, secret, password, credential, authorization or cookie, or its last word is auth, bearer, pat or pass (`credentialField` in `lib/provenance.ts`); a `$NAME` reference stays. URL logins and credential query values are also removed at any depth.

Retired evals are summarised in [`reports/retired-evals.md`](reports/retired-evals.md).

## Layout

The [public results ledger](https://itlackey.github.io/akm-eval/) presents the
every committed run in `reports/`, with sortable quality, performance and settings
columns, full filtering, row comparison and artifact links. Run `eval_docker scripts/ledger/run` to build it locally. `.github/workflows/ledger-pages.yml`
builds pull requests and publishes main changes to the reports or site.
See [site/README.md](site/README.md) for publishing and refreshes.

```
evals/, benchmarks/   one folder per eval: run, generate, src/, assets/, results/ (gitignored)
corpus/library/       the shared akm library the evals use, also usable as an akm bundle
lib/                  what the evals share: the akm sandbox, models, corpora, manifest, --repeat, the rewrite
scripts/              check, compare, ledger, rescore, smoke
site/                 source of the public GitHub Pages results ledger
generate-assets       makes the custom corpus of every eval in private/
reports/              published results and notes (see reports/README.md)
releases/             release notes
retired/              code of retired evals, to read, not to run
private/, .cache/     your custom corpora and results, akm's embedding model (both gitignored)
```

## Set up with Docker

Docker is the only runtime to install on your machine. The prebuilt runner includes
all eval tools, Python/Node/Bun packages, AKM and the native embedding model. Create a dedicated working folder; the image refreshes its own code
there and retains your configuration, datasets and results. See the [Docker guide](docker/README.md)
for read-only configuration/case mounts, Harbor's Docker socket, stop/resume and image digests.

```sh
export AKM_EVAL_IMAGE=ghcr.io/itlackey/akm-eval:main
export AKM_EVAL_WORK="$PWD/akm-eval-work"
mkdir -p "$AKM_EVAL_WORK"
docker pull "$AKM_EVAL_IMAGE"
eval_docker() {
  docker run --rm --init --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$AKM_EVAL_WORK,dst=$AKM_EVAL_WORK" \
    --workdir "$AKM_EVAL_WORK" "$AKM_EVAL_IMAGE" "$@"
}
eval_docker bash -c 'cp -n .env.example .env'
```

Edit `$AKM_EVAL_WORK/.env`: `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME`
select the model; `JUDGE_MODEL` and optional `JUDGE_BASE_URL`/`JUDGE_API_KEY` select
LongMemEval's judge. `AKM_BIN` optionally names another mounted AKM build. Native
development from a source checkout is still supported with Bun and AKM; Harbor
also needs uv and Docker. Host package installation is not part of the Docker workflow.

A nonempty value in `.env` wins over the same shell variable; an empty value
leaves the shell's. The image has no credentials. AKM runs in isolated temporary
folders and receives only the allowed environment and keys named by its config.

## Run an eval

```
eval_docker evals/retrieval/run --semantic on       # the public corpus
eval_docker evals/reflect/run --semantic --limit 5             # five cases, to check a setup
eval_docker evals/reflect/run --label qwen          # results in evals/reflect/results/<UTC date>-qwen/
```

A run writes `evals/<name>/results/<UTC date>-<label>/` (custom corpora write under `private/<name>/results/`). The default label is the model name (`akm-<version>` for the two that call no model). While a run is alive its folder holds a `.running` file with its pid. A run that gives up (the endpoint down, too many errors) writes its summary with `status: "aborted"` and exits non-zero: do not compare it.

## Pick the model and the akm build

```
eval_docker evals/consolidate/run --model my-cloud-model
eval_docker evals/reflect/run --model my-small-model --semantic --label check
eval_docker benchmarks/longmemeval/run --model my-model --judge-model my-judge
```

- `--model ID` names the model, as your gateway at `MODEL_BASE_URL` names it, and wins over `MODEL_NAME`. `--judge-model ID` does the same for the judge.
- A model that is not behind that gateway takes a line in `models.json` (copy `models.example.json`; gitignored): `{ "name": { "base_url": "...", "api_key_env": "SOME_KEY", "model": "..." } }`. `--model name` then goes to that URL with the key in that variable. Never put a key in `models.json`.
- Harbor evals accept optional `"limits": { "context": 32768, "output": 4096 }` in a `models.json` entry. OpenCode uses these budgets for context compaction. Both arms receive identical limits, recorded in the saved job configuration. Set them to the server's actual budgets; see [OpenCode provider configuration](https://opencode.ai/docs/providers/#custom-provider). LongMemEval also accepts per-role Chat Completions settings, described below.
- `--akm COMMAND` (or `AKM_BIN`) is a command line, such as `bun ~/code/akm/src/cli.ts`. Quote a word with spaces; a leading `~/` is your home folder; nothing else is expanded.
- The Harbor evals (`agent-ab`, `terminal-bench`) install akm in a container, so their `--akm` is a release (`akm-cli@0.9.26`) or the folder of an akm checkout, and `--akm-env KEY=VALUE` sets an `AKM_*` setting for the akm arm. opencode there calls the Responses API.
- `--strategy NAME` and `--config-patch FILE` run another akm strategy or config than the eval's own. `--embedder deterministic|real` (consolidate, nightly) picks akm's word-hash embedder (default) or its real embedding model; the two are never compared.

`summary.json` records the model, `akm_version`, `akm_bin`, `akm_build` (`git describe` of a checkout) and `akm_build_fingerprint` (a digest of its uncommitted changes). A pre-release can print the version of the release it branched from, so read `akm_build` to tell builds apart, and put the build in `--label`. Before measuring a new akm, run `scripts/smoke/run --contract --akm "..."` to see that the evals still read it.

Use `--semantic` consistently on the process evals, Agent A/B, LongMemEval and Terminal-Bench. Process evals merge the pinned native embedder settings with any `--config-patch` and record the effective patch digest. Retrieval keeps its existing `--semantic on` syntax; SkillRet retains both comparators. For consolidate and nightly, `--semantic` also selects `--embedder real`; an explicit deterministic embedder conflicts. Defaults remain unchanged, so the search choice is explicit. Process summaries include `semantic_verification`: embedding coverage and counts of semantic, nonsemantic and unknown search events. Incomplete coverage or a nonsemantic search is an error. Verification reads the eval's own events and adds no probe search; zero searches means retrieval was not observed, even when semantic search was configured. `telemetry_errors` flags unavailable search-event evidence.

LongMemEval model entries can add `"chat": { "max_completion_tokens": 2048, "reasoning_effort": "none" }`, or `max_tokens` for endpoints that require that field. Choose settings the actual reader/judge supports; only the selected role receives them. Both reader arms use identical settings. Context limits belong in `limits`; Chat Completions output settings belong in `chat`. The example budgets are configuration examples, not measured server capacities. See [models.example.json](models.example.json) and [the LongMemEval guide](benchmarks/longmemeval/README.md).

## Corpora

```
eval_docker evals/distill/run                                # --corpus public, the default
eval_docker evals/distill/run --corpus custom                # the rewrite in private/distill/assets
eval_docker evals/distill/run --cases private/my-distill --yes        # a folder of your own cases
eval_docker evals/distill/run --corpus all                   # public and custom, side by side, never pooled
```

- `public` is the cases committed here, or the dataset a benchmark fetches.
- `custom` is the public cases rewritten from a seed by `./generate-assets` (see "Custom corpora"), or, with `--cases DIR`, a folder of your own in the eval's format. Each eval's README describes the format. A relative `DIR` is from the repository root. `evals/promotion` has no rewrite, so its custom corpus is `--cases` only. `benchmarks/skillret` takes no `--cases`: its custom corpus is another split of its dataset.

A run with `--cases` sends your cases to a model, so before anything runs it says where and asks:

```
The cases in ~/notes/distill will be sent to:
  model  qwen3-8b at https://gateway.example/v1
Continue? [Y/n]
```

`-y` or `--yes` skips the question. With no terminal and no `-y` the run stops, so a script with `--cases` needs `-y`. A public or rewrite run never asks. `evals/retrieval` calls no model, and takes `-y` without needing it.

## Run, save, compare

Each eval's `run` command runs once by default. It writes `summary.json` and
`samples.jsonl` to its results folder, including quality metrics, available timing
and usage, errors, settings and input identities. Completed runs also record
`wall_seconds` (unknown for resumed runs whose earlier duration is unavailable).
A run with errors keeps them visible; a gracefully stopped run keeps its
partial artifacts and clears its `.running` marker. Existing benchmark-specific resume flags still work.

```sh
eval_docker evals/reflect/run --model model-a --label model-a
eval_docker evals/reflect/run --model model-b --label model-b
eval_docker scripts/compare/run evals/reflect/results/<A> evals/reflect/results/<B>
```

There is no special baseline, mandatory repeat count or saved scheduling state.
Any two compatible saved runs can be compared whenever needed. Comparison makes
no model calls and never changes results. It shows stored quality, performance,
usage, settings and B-minus-A differences. It does not declare a statistical
winner. The [public ledger](https://itlackey.github.io/akm-eval/) offers filtering,
sorting and export of each published run; [site documentation](site/README.md)
explains the fields and question-focused views.

Comparisons require the same eval version, scoring version, corpus, collection,
mode, selected case IDs, input digests and labels. Model, AKM and configuration
changes are shown as the things being compared. No cases are silently dropped.
Unequal scored or timing coverage leaves the affected deltas blank. A new full
run cannot be compared with an old smaller set merely because some IDs match.
Results before 0.2 have no manifest and must be collected again.

### Optional repeats

Use `--repeat N` when a small difference or an unstable result warrants more
observations. Each repeat is an independent saved run; the optional repeat
summary contains descriptive min/max/mean values. It is not a significance test.
Benchmark-native attempts and paired with/without-AKM controls remain available.
Repeated deterministic retrieval normally adds little information.

```sh
eval_docker evals/reflect/run --model model-a --repeat 2 --label check-variation
```

### Explicit rescoring

For a scoring fix or updated labels, `scripts/rescore/run RESULTS_DIR` reads saved
raw output and writes a new `-rescored` folder. Supply `--cases DIR` when a custom
corpus is outside the repository or has moved. It preserves the original
collection identity and records the current scoring version. Changed or missing
inputs are refused: those require a new collection. The original stays intact.
Rescoring is never part of a comparison or ledger build.

Bump the eval's `version` in `src/measurement.ts` when inputs, case selection,
collection protocol, labels or scoring rules change. Record the reason in
[MEASUREMENT_CHANGELOG.md](MEASUREMENT_CHANGELOG.md). Existing results retain their
versions. Do not recollect for documentation, UI or reporting-only changes.

See [comparison commands](scripts/compare/README.md) and the
[v0.6 migration notes](releases/v0.6.md) for old matrix users.

## Check the repository

```
eval_docker scripts/check              # typecheck, python, test, in that order
eval_docker scripts/check typecheck    # tsc in every src folder
eval_docker scripts/check python       # the Harbor arm's tests, with uv
eval_docker scripts/check test         # bun test at the root
```

The fixture tests use fake AKM/model processes. In the Docker workflow, the image provides all test dependencies. `.github/workflows/check.yml` runs `scripts/check` on every push and pull request. `.github/workflows/akm-smoke.yml` runs `scripts/smoke/run` nightly against real akm releases: it runs each eval once on one case against a stub model, to see that akm still takes the evals' commands (see [`scripts/smoke/README.md`](scripts/smoke/README.md)). `.github/workflows/container.yml` builds/verifies the preinstalled runner and publishes the GHCR image on main. `.github/workflows/release.yml` publishes a release from `releases/v<version>.md`, by hand.

## Custom corpora

```
eval_docker ./generate-assets                          # every eval
eval_docker ./generate-assets --only retrieval,nightly # some
eval_docker ./generate-assets --seed 42                # another seed, for this run
```

`./generate-assets` rewrites each eval's public cases from a seed into `private/<eval>/assets`, with the seed in its `generated.json`. The first run creates `private/seed`. The rewrite (`lib/rewrite`) changes names, tool names, hosts, ids, dates and numbers, a few percent of the words, and keeps the meaning and the labels. It is not held-out data: a model that has seen the public cases can still recognise them.

`private/` is gitignored. Never publish it, or a summary with a rewrite's `seed`: the seed makes the set again. A set that has leaked is burned: delete `private/seed` and generate again.

## Licence

Everything here is MPL-2.0 (`LICENSE`). Third-party items keep their own licences and are listed in `NOTICE`. Benchmark data is fetched when you run the benchmark and is never committed.

## Use the library as an akm bundle

`corpus/library` is a working akm bundle. Add it to an agent's akm config as a git bundle:

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

See `corpus/library/README.md` for what it holds.
