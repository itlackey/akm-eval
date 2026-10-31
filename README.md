# akm-eval

Evals and benchmarks for [akm](https://github.com/itlackey/akm), as a set of scripts. Each one runs akm on a set of cases, scores what akm returns, and saves the results. Compare saved runs with `scripts/compare` or explore published quality and performance in the ledger. Runs are single by default; repeats are optional.

Most evals run against any OpenAI-compatible model, local or cloud. `evals/retrieval` and `benchmarks/skillret` call no model. `evals/agent-ab` and `benchmarks/terminal-bench` run opencode in Docker through Harbor.

## Evals and benchmarks

Every folder below has a `run` script. Every `run` takes `--corpus`, `--limit` and `--label`; the table lists the other flags. `run --help` explains each, and each folder's README says how a case is scored and what the summary reports. [`COMPATIBILITY.md`](COMPATIBILITY.md) says which akm each one runs on.

| Folder | Question it answers | Flags |
|---|---|---|
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | `--cases` `--repeat` `--akm` `--semantic` |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | `--cases` `--repeat` `--retrieval-queries` `--strategy` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `evals/distill` | Do distilled lessons say only what the source memory says? | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | `--cases` `--repeat` `--pool` `--strategy` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `evals/extract` | Does extraction pull durable insights from session logs, and leave routine sessions empty? | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `evals/nightly` | Does a full nightly improve run give good results unattended? | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--timeout-ms` `--semantic` |
| `evals/promotion` | Of the promotions consolidate proposes, does the drain's judgment tier accept the good ones? | `--cases` `--repeat` `--strategy` `--config-patch` `--model` `--akm` `--timeout-ms` `--semantic` |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | `--cases` `--repeat` `--concurrency` `--model` `--akm` `--akm-env` `--semantic` |
| `evals/bakeoff` | Does the model do what akm asks in the jobs no other eval measures? | `--cases` `--repeat` `--process` `--config-patch` `--model` `--akm` `--concurrency` `--timeout-ms` `--semantic` |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | `--cases` `--repeat` `--sample-seed` `--retrieval-only` `--semantic` `--resume` `--model` `--judge-model` `--akm` |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | `--cases` `--attempts` `--repeat` `--model` `--akm` `--akm-env` `--concurrency` `--resume` `--semantic` |
| `benchmarks/skillret` | Does akm rank the right skills first in a large skill library (SkillRet)? | `--repeat` `--semantic` `--akm` |

`scripts/smoke/src/readme.test.ts` runs every `run --help` and fails when this table lists other flags.

Eight evals, the process evals (reflect, distill, extract, judge-gate, promotion, bakeoff, consolidate, nightly), run on one driver, `lib/run.ts`, so they share their common flags, banner, give-up rule and `summary.json` fields. The others have runners of their own.

- **What a summary records.** Each run writes `summary.json` and `samples.jsonl` (one row per case, with akm's raw output). The process evals record `model`, `akm_version`, `akm_bin`, `akm_build`, `akm_build_fingerprint`, `limit`, `strategy` (bakeoff has none), `config_patch`, `config` (the akm config the eval wrote), `engine` (the model, and its endpoint as `<MODEL_BASE_URL>`: never the host or the path), `assets_sha256`, `seed`, `n_errored`, `timeout_ms`, `status` and `metrics`, and `concurrency` when cases run through the pool. They also record `model_calls`, from akm's own record of each call: `calls`, `errors`, and per successful call the mean `prompt_tokens`, `completion_tokens` and `seconds`, with `output_tokens_per_second`. akm does not stream, so a call's time includes its prefill: prefill and decode are not told apart. New summaries record a `manifest` (`lib/manifest.ts`; its `settings.timeout_ms` is the effective timeout) and completion status; comparison also reads older summaries that lack those fields. A config value is written as `<redacted>` when its key ends in key, token, secret, password, credential, authorization or cookie, or its last word is auth, bearer, pat or pass (`credentialField` in `lib/provenance.ts`); a `$NAME` reference stays. URL logins and credential query values are also removed at any depth.

Retired evals are summarised in [`reports/retired-evals.md`](reports/retired-evals.md), which says where their code is.

## Layout

The [public results ledger](https://itlackey.github.io/akm-eval/) presents every committed run in `reports/`, with sortable quality, performance and settings columns, full filtering, row comparison and artifact links. Run `eval_docker scripts/ledger/run` to build it locally. `.github/workflows/ledger-pages.yml` builds pull requests and publishes main changes to the reports or site. See [site/README.md](site/README.md) for publishing and refreshes.

```
evals/, benchmarks/   one folder per eval: run, generate, src/, assets/, results/ (gitignored)
corpus/library/       the shared akm library the evals use, also usable as an akm bundle
lib/                  what the evals share: the driver (run.ts), the akm sandbox, models, corpora, manifest, --repeat, the rewrite
scripts/              check, compare, ledger, rescore, smoke
site/                 source of the public GitHub Pages results ledger
generate-assets       makes the custom corpus of every eval in private/
reports/              published results and notes (see reports/README.md)
releases/             release notes
private/, .cache/     your custom corpora and results; akm's embedding model and ONNX Runtime, the semantic indexes and the Harbor setup cache (both gitignored)
```

## Set up with Docker

Docker is the only runtime to install. The prebuilt runner has every tool, AKM and the native embedding model, and keeps your configuration, datasets and results in a dedicated working folder. The [Docker guide](docker/README.md) covers read-only mounts, Harbor's Docker socket, stop and resume, and image digests.

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

Edit `$AKM_EVAL_WORK/.env`: `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME` select the model, and `MODEL_PROVIDER` the akm provider kind (below); `JUDGE_MODEL` and optional `JUDGE_BASE_URL`/`JUDGE_API_KEY` select LongMemEval's judge; `AKM_BIN` optionally names another mounted AKM build. Native development from a source checkout needs Bun and AKM, and Harbor also uv and Docker.

A nonempty value in `.env` wins over the same shell variable; an empty value leaves the shell's. The image has no credentials. AKM runs in isolated temporary folders and receives only the allowed environment and keys named by its config.

## Run an eval

```
eval_docker evals/retrieval/run --semantic          # the public corpus, semantic search scored too
eval_docker evals/reflect/run --semantic --limit 5  # five cases, to check a setup
eval_docker evals/reflect/run --label qwen          # results in evals/reflect/results/<UTC date>-qwen/
```

A run writes `evals/<name>/results/<UTC date>-<label>/` (custom corpora write under `private/<name>/results/`). The default label is the model name (`akm-<version>` for the two that call no model). While a run is alive its folder holds a `.running` file with its pid.

The process evals print a banner before the first case: the model and its host, the provider, keyword or semantic search (and the embedding model), temperature and thinking, strategy, config patch, concurrency, timeout and the akm version. After the akm version check they also send the model endpoint one one-token request, so a wrong URL, key or model name ends the run before the first case, with the endpoint's answer and no results folder. `AKM_EVAL_NO_PROBE=1` skips the request, for an endpoint that serves no chat completions.

`--timeout-ms N` (how long one akm command may run) and `--concurrency N` (cases at once in the process evals, default 1 and judge-gate 2; trials at once in agent-ab and terminal-bench, default 4) are the two performance knobs: raise `--timeout-ms` for a slow provider, such as a local model, and `--concurrency` for one that serves requests in parallel. `run --help` shows each eval's default timeout. nightly, promotion and `consolidate --pool` run as one batch: they have no `--concurrency`, and their `--timeout-ms` is the budget of that one run. Both settings are recorded in `summary.json`.

A run gives up after five errored cases in a row (judge-gate also counts a reply with no verdict): it starts no new case, writes its summary with `status: "aborted"` and the reason, and exits 1. A batch has no row-by-row rule: a nightly whose night fails writes an aborted summary, and promotion aborts when no proposal got a verdict. Saved results of an aborted run remain available for inspection and comparison, with incomplete coverage marked.

## Pick the model and the akm build

```
eval_docker evals/consolidate/run --model my-cloud-model
eval_docker evals/reflect/run --model my-small-model --semantic --label check
eval_docker benchmarks/longmemeval/run --model my-model --judge-model my-judge
```

- `--model ID` names the model, as your gateway at `MODEL_BASE_URL` names it, and wins over `MODEL_NAME`. `--judge-model ID` does the same for the judge.
- A model that is not behind that gateway takes a line in `models.json` (copy `models.example.json`; gitignored): `{ "name": { "base_url": "...", "api_key_env": "SOME_KEY", "model": "...", "provider": "anthropic" } }`. `--model name` then goes to that URL with the key in that variable. Never put a key in `models.json`.
- `provider` (the line's, else `MODEL_PROVIDER` in `.env`, else `openai`) is the provider kind akm gives its engine: `openai`, `anthropic`, `gemini`, `groq`, `ollama` or `lmstudio`. The endpoint stays base URL + `/chat/completions`. Every process eval gives it to akm; the Harbor evals take the provider from the model name instead (`provider/model`, the opencode form).
- A line may also hold `limits` and `chat`. Harbor evals take `"limits": { "context": 32768, "output": 4096 }`: OpenCode uses these budgets for context compaction, both arms receive the same, and the saved job records them. Set them to the server's actual budgets; see [OpenCode provider configuration](https://opencode.ai/docs/providers/#custom-provider). `chat` holds Chat Completions settings (below); the Harbor evals forward only `chat.reasoning_effort`, to opencode in both arms. The process evals read neither.
- `--akm COMMAND` (or `AKM_BIN`) is a command line, such as `bun ~/code/akm/src/cli.ts`. Quote a word with spaces; a leading `~/` is your home folder; nothing else is expanded.
- The Harbor evals (`agent-ab`, `terminal-bench`) install akm in a container, so their `--akm` is a release (`akm-cli@0.9.26`) or the folder of an akm checkout, and `--akm-env KEY=VALUE` sets an `AKM_*` setting for the akm arm. opencode there calls the Responses API.
- `--strategy NAME` and `--config-patch FILE` run another akm strategy or config than the eval's own (bakeoff has no `--strategy`).

`summary.json` records the model, `akm_version`, `akm_bin`, `akm_build` (`git describe` of a checkout) and `akm_build_fingerprint` (a digest of its uncommitted changes). Both are null for an installed release, such as the akm in the Docker image (`akm_bin` is then `akm`), and `akm_version` is what names it. A pre-release can print the version of the release it branched from, so read `akm_build` to tell builds apart, and put the build in `--label`. Before measuring a new akm, run `scripts/smoke/run --contract --akm "..."` to see that the evals still read it.

`--semantic` is a plain flag on every eval that searches, and nothing falls back to another search: without it a run uses keyword search only (promotion is the exception: its judge finds neighbours by their stored vectors, so it always indexes and searches with akm's built-in model; consolidate and nightly also pair notes with akm's deterministic word-hash embedder, and `--semantic` gives them akm's built-in model, which can pair other notes). Retrieval and SkillRet score semantic search only with it, whatever `--limit` says. Process evals merge the pinned native embedder settings with any `--config-patch` and record the effective patch digest. Their summaries include `semantic_verification`: embedding coverage and counts of semantic, nonsemantic and unknown search events. Incomplete coverage or a nonsemantic search is an error. Verification reads the eval's own events and adds no probe search; zero searches means retrieval was not observed, even when semantic search was configured. `telemetry_errors` flags unavailable search-event evidence.

LongMemEval model entries can add `"chat": { "max_completion_tokens": 2048, "reasoning_effort": "none" }`, or `max_tokens` for endpoints that require that field, and `temperature` (requests send 0 otherwise; a reasoning model may reject it). Only the role that names the entry, reader or judge, receives them, and both reader arms use identical settings. Choose settings the endpoint supports. See [models.example.json](models.example.json) and [the LongMemEval guide](benchmarks/longmemeval/README.md).

## Before an expensive run

- Run `--limit 1` first and read the banner: the model the endpoint served, search mode (keyword or semantic), temperature, thinking, concurrency and timeout. A run that cannot reach the model stops there.
- `--semantic` is always explicit. Without it a run searches by keyword only (promotion always searches semantically), nothing falls back silently, and with it a search that does not come back semantic is an error.
- Bound a reasoning model's thinking; each path does it differently. The process evals send temperature 0 and thinking off, and `--config-patch` changes the akm engine's `enableThinking` and `temperature` (the engine is named in the `config` of a `summary.json`). LongMemEval reads `chat.reasoning_effort`, `chat.max_completion_tokens` and `chat.temperature` from the `models.json` lines of the reader and the judge. The Harbor evals forward `chat.reasoning_effort` and read no other `chat` key.
- Set `limits` in `models.json` to the server's real context and output budget, so opencode compacts before the control arm overflows the server's context (Harbor evals; LongMemEval's without-akm arm needs a context of 131k or more).
- Pick `--concurrency` before a full run: changing it later means stopping and starting over, since Terminal-Bench's `--resume` refuses another width and Agent A/B has no `--resume`. Above 8 concurrent trials Docker's default address pools can run out, and the run warns: see "Concurrency and Docker networks" in [`evals/agent-ab/README.md`](evals/agent-ab/README.md).
- Watch a run with `wc -l <results>/samples.jsonl`, one line per finished case (nightly, promotion and `consolidate --pool` write all their rows when the batch ends). Stop it with `docker stop --timeout 120 <name>` (`docker ps` shows the name; the Harbor runner uses the 120 seconds to save its checkpoint). Without Docker, `kill $(cat <results>/.running)` does the same; in a container that pid means nothing on the host.
- A run that gives up writes `summary.json` with `status: "aborted"` and exits 1; so does a stopped LongMemEval or Harbor run. A stopped process eval keeps `samples.jsonl` and no summary, so use `--limit` for a shorter run you want kept. compare warns about any status but `complete`, and the ledger files such a run as a diagnostic, with its counts.

## Corpora

```
eval_docker evals/distill/run                                # --corpus public, the default
eval_docker evals/distill/run --corpus custom                # the rewrite in private/distill/assets
eval_docker evals/distill/run --cases private/my-distill        # a folder of your own cases
eval_docker evals/distill/run --corpus all                   # public and custom, side by side, never pooled
```

- `public` is the cases committed here, or the dataset a benchmark fetches.
- `custom` is the public cases rewritten from a seed by `./generate-assets` (see "Custom corpora"), or, with `--cases DIR`, a folder of your own in the eval's format. Each eval's README describes the format. A relative `DIR` is from the repository root. `evals/promotion` has no rewrite, so its custom corpus is `--cases` only. `benchmarks/skillret` takes no `--cases`: its custom corpus is another split of its dataset.

An explicit `--cases DIR` selects your custom cases. Before model calls, the run prints the model and judge destinations with credentials removed, then proceeds without asking. Retrieval-only runs make no model calls.

## Run, save, compare

Each eval's `run` command runs once by default. It writes `summary.json` and `samples.jsonl` to its results folder, including quality metrics, available timing and usage, errors, settings and input identities. Completed runs also record `wall_seconds` (unknown for resumed runs whose earlier duration is unavailable). A run with errors keeps them visible; a stopped run keeps its partial artifacts and clears its `.running` marker. Benchmark-specific resume flags still work.

```sh
eval_docker evals/reflect/run --model model-a --label model-a
eval_docker evals/reflect/run --model model-b --label model-b
eval_docker scripts/compare/run evals/reflect/results/<A> evals/reflect/results/<B>
```

There is no special baseline, mandatory repeat count or saved scheduling state: any two saved runs can be viewed side by side. Comparison makes no model calls and never changes results. It reads legacy, stopped and summary-only results and shows stored quality, performance, usage, coverage, changed settings and B-minus-A differences, without hash, manifest, version or completion gates, and it declares no statistical winner. Interpret differences using the recorded models, AKM builds, configurations and conditions, including cold versus warm indexes. See the [comparison commands](scripts/compare/README.md); the [public ledger](https://itlackey.github.io/akm-eval/) offers filtering, sorting and export of each published run, and the [site documentation](site/README.md) explains its fields and question-focused views.

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
collection metadata and records the current scoring version. It requires the
cases and raw output that the scorer uses, without hash checks. The original
stays intact. Rescoring is never part of a comparison or ledger build.

Bump the eval's `version` in `src/measurement.ts` when inputs, case selection or
collection protocol change. For a scoring correction or label-only change, set
`scoringVersion` instead; it defaults to `version`. Record the reason in
[MEASUREMENT_CHANGELOG.md](MEASUREMENT_CHANGELOG.md). Existing results retain their
versions. Do not recollect for documentation, UI or reporting-only changes.

## Check the repository

```
eval_docker scripts/check              # typecheck, python, test, in that order
eval_docker scripts/check typecheck    # tsc in every src folder
eval_docker scripts/check python       # the Harbor arm's tests, with uv
eval_docker scripts/check test         # bun test at the root
```

The fixture tests use fake AKM/model processes. In the Docker workflow, the image provides all test dependencies. `.github/workflows/check.yml` runs `scripts/check` on every pull request and every push to main. `.github/workflows/akm-smoke.yml` runs `scripts/smoke/run` against real akm releases, nightly and on pull requests (the pinned release only): it runs each eval once on one case against a stub model, to see that akm still takes the evals' commands (see [`scripts/smoke/README.md`](scripts/smoke/README.md)). `.github/workflows/container.yml` builds/verifies the preinstalled runner and publishes the GHCR image on main. `.github/workflows/release.yml` publishes a release from `releases/v<version>.md`, by hand.

## Work on the repository

- **Run from a worktree.** A new worktree or clone has none of the gitignored local files. Copy or link `.env`, `models.json` and `private` (a folder or a link) into it from your main checkout. Without `models.json` the Harbor evals have no `limits` for the model: they warn, and their runs are not comparable with runs that had limits.
- **Run akm by hand.** Set `AKM_BUNDLE_DIR`, `AKM_CONFIG_DIR`, `AKM_DATA_DIR`, `AKM_CACHE_DIR`, `AKM_STATE_DIR` and the `XDG_*` folders to temporary folders, as the evals do (`sandboxEnv` in `lib/akm/akm.ts`). With only the `XDG_*` folders set, akm still indexes your default stash, though its database goes to the temporary folder.
- **gh.** `gh issue view`, `gh pr view` and `gh pr edit` can fail on this repository with a GraphQL error about the deprecation of Projects (classic). The `--json` forms of the view commands and `gh api repos/itlackey/akm-eval/...` work (`gh api --method PATCH repos/itlackey/akm-eval/pulls/N` in place of `gh pr edit`).

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
