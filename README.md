# akm-eval

Evals and benchmarks for [akm](https://github.com/itlackey/akm), as a set of scripts. Each one runs akm on a set of cases, scores what akm returns, and writes the result to a folder. Run the same eval on two akm builds and `scripts/compare` tells you which cases changed and whether the change is more than noise.

Most evals run against any OpenAI-compatible model, local or cloud. `evals/retrieval` and `benchmarks/skillret` call no model. `evals/agent-ab` and `benchmarks/terminal-bench` run opencode in Docker through Harbor.

## Evals and benchmarks

Every folder below has a `run` script. Every `run` takes `--corpus`, `--limit` and `--label`; the table lists the other flags. `run --help` explains each, and each folder's README says how a case is scored and what the summary reports. [`COMPATIBILITY.md`](COMPATIBILITY.md) says which akm each one runs on.

| Folder | Question it answers | Flags |
|---|---|---|
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | `--cases` `--yes` `--repeat` `--akm` `--semantic` |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | `--cases` `--yes` `--repeat` `--retrieval-queries` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/distill` | Do distilled lessons say only what the source memory says? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | `--cases` `--yes` `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` `--pool` `--timeout-ms` |
| `evals/extract` | Does extraction pull durable insights from session logs, and leave routine sessions empty? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/nightly` | Does a full nightly improve run give good results unattended? | `--cases` `--yes` `--repeat` `--embedder` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/promotion` | Of the promotions consolidate proposes, does the drain's judgment tier accept the good ones? | `--cases` `--yes` `--repeat` `--strategy` `--config-patch` `--model` `--akm` |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | `--cases` `--yes` `--repeat` `--model` `--akm` `--akm-env` |
| `evals/bakeoff` | Does the model do what akm asks in the jobs no other eval measures? | `--cases` `--yes` `--process` `--repeat` `--config-patch` `--model` `--akm` |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | `--cases` `--yes` `--repeat` `--sample-seed` `--retrieval-only` `--semantic` `--resume` `--model` `--judge-model` `--akm` |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | `--attempts` `--cases` `--yes` `--repeat` `--model` `--akm` `--akm-env` |
| `benchmarks/skillret` | Does akm rank the right skills first in a large skill library (SkillRet)? | `--repeat` `--akm` |

`scripts/smoke/src/readme.test.ts` runs every `run --help` and fails when this table lists other flags.

- **What a summary records.** Each run writes `summary.json` and `samples.jsonl` (one row per case, with akm's raw output). The seven evals that run a model through akm record `model`, `akm_version`, `akm_bin`, `akm_build`, `akm_build_fingerprint`, `limit`, `strategy`, `config_patch`, `config` (the akm config the eval wrote), `engine` (the model and the host of its endpoint, never the path), `assets_sha256`, `seed`, `n_errored` and `metrics`. Every summary has a `manifest` (`lib/manifest.ts`), which is what compare reads, and a `status` of `complete` or `aborted`. A config value is written as `<redacted>` when its key ends in key, token, secret, password, credential, authorization or cookie, or its last word is auth, bearer, pat or pass (`credentialField` in `lib/provenance.ts`); a `$NAME` reference stays. URL logins and credential query values are also removed at any depth.

Retired evals are summarised in [`reports/retired-evals.md`](reports/retired-evals.md).

## Layout

The [public results ledger](https://itlackey.github.io/akm-eval/) presents the
committed runs in `reports/`, with metric denominators, collection errors,
repeat variation, filters and artifact links. Run `bun run build:site` (or
`scripts/ledger/run`) to build it locally. `.github/workflows/ledger-pages.yml`
builds pull requests and publishes main changes to the reports or site.
See [site/README.md](site/README.md) for publishing and refreshes.

```
evals/, benchmarks/   one folder per eval: run, generate, src/, assets/, results/ (gitignored)
corpus/library/       the shared akm library the evals use, also usable as an akm bundle
lib/                  what the evals share: the akm sandbox, models, corpora, manifest, --repeat, the rewrite
scripts/              check, compare, ledger, matrix, rescore, smoke
site/                 source of the public GitHub Pages results ledger
generate-assets       makes the custom corpus of every eval in private/
reports/              published results and notes (see reports/README.md)
releases/             release notes
retired/              code of retired evals, to read, not to run
private/, .cache/     your custom corpora and results, akm's embedding model (both gitignored)
```

## Set up

You need [bun](https://bun.sh) and akm on `PATH` (or `AKM_BIN`). The Harbor evals also need Docker and [uv](https://docs.astral.sh/uv/), and so does `scripts/check python`.

Copy `.env.example` to `.env` and fill it in:

- `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME`: the model under test.
- `JUDGE_MODEL`, and `JUDGE_BASE_URL` with `JUDGE_API_KEY` if the judge is elsewhere: the judge, for `benchmarks/longmemeval` and `evals/retrieval/label`.
- `AKM_BIN`: the akm to run, if not the one on `PATH`.

A variable already set in your shell wins over `.env`. `.env` is gitignored.

akm runs in a sandbox of temp folders per run and never touches your own akm bundle. It gets only a short list of your environment (`ALLOWED_ENV` in `lib/akm/akm.ts`) plus the variables its config names as `$NAME`, such as `$MODEL_API_KEY`.

## Run an eval

```
evals/retrieval/run                     # the public corpus
evals/reflect/run --limit 5             # five cases, to check a setup
evals/reflect/run --label baseline      # results in evals/reflect/results/<UTC date>-baseline/
```

A run writes `evals/<name>/results/<UTC date>-<label>/` (custom corpora write under `private/<name>/results/`). The default label is the model name (`akm-<version>` for the two that call no model). While a run is alive its folder holds a `.running` file with its pid. A run that gives up (the endpoint down, too many errors) writes its summary with `status: "aborted"` and exits non-zero: do not compare it.

## Pick the model and the akm build

```
evals/consolidate/run --model my-cloud-model
evals/reflect/run --model my-small-model --akm "bun ~/code/akm/src/cli.ts" --label pr1100
benchmarks/longmemeval/run --model my-model --judge-model my-judge
```

- `--model ID` names the model, as your gateway at `MODEL_BASE_URL` names it, and wins over `MODEL_NAME`. `--judge-model ID` does the same for the judge.
- A model that is not behind that gateway takes a line in `models.json` (copy `models.example.json`; gitignored): `{ "name": { "base_url": "...", "api_key_env": "SOME_KEY", "model": "..." } }`. `--model name` then goes to that URL with the key in that variable. Never put a key in `models.json`.
- `--akm COMMAND` (or `AKM_BIN`) is a command line, such as `bun ~/code/akm/src/cli.ts`. Quote a word with spaces; a leading `~/` is your home folder; nothing else is expanded.
- The Harbor evals (`agent-ab`, `terminal-bench`) install akm in a container, so their `--akm` is a release (`akm-cli@0.9.26`) or the folder of an akm checkout, and `--akm-env KEY=VALUE` sets an `AKM_*` setting for the akm arm. opencode there calls the Responses API.
- `--strategy NAME` and `--config-patch FILE` run another akm strategy or config than the eval's own. `--embedder deterministic|real` (consolidate, nightly) picks akm's word-hash embedder (default) or its real embedding model; the two are never compared.

`summary.json` records the model, `akm_version`, `akm_bin`, `akm_build` (`git describe` of a checkout) and `akm_build_fingerprint` (a digest of its uncommitted changes). A pre-release can print the version of the release it branched from, so read `akm_build` to tell builds apart, and put the build in `--label`. Before measuring a new akm, run `scripts/smoke/run --contract --akm "..."` to see that the evals still read it.

## Corpora

```
evals/distill/run                                # --corpus public, the default
evals/distill/run --corpus custom                # the rewrite in private/distill/assets
evals/distill/run --cases ~/notes/distill        # a folder of your own cases
evals/distill/run --corpus all                   # public and custom, side by side, never pooled
```

- `public` is the cases committed here, or the dataset a benchmark fetches.
- `custom` is the public cases rewritten from a seed by `./generate-assets` (see "Custom corpora"), or, with `--cases DIR`, a folder of your own in the eval's format. Each eval's README describes the format. A relative `DIR` is from the repository root. `evals/promotion` has no rewrite, so its custom corpus is `--cases` only. `benchmarks/skillret` takes no `--cases`: its custom corpus is another split of its dataset.

A run with `--cases` sends your cases to a model, so before anything runs it says where and asks:

```
The cases in ~/notes/distill will be sent to:
  model  qwen3-8b at https://gateway.example/v1
Continue? [Y/n]
```

`-y` or `--yes` skips the question. With no terminal and no `-y` the run stops, so a script or a matrix row with `--cases` needs `-y` in its args. A public or rewrite run never asks. `evals/retrieval` calls no model, and takes `-y` without needing it.

## Repeat a run

A model's answers differ by a case or two from one run to the next, so one run cannot tell a change from noise. `--repeat N`, on every eval and benchmark, runs the corpus N times into `<UTC date>-<label>-r1` to `-rN`, and writes the min, max and mean of each metric to `<UTC date>-<label>-repeat-summary.json`.

```
evals/promotion/run --repeat 3 --label base
scripts/compare/run --repeats evals/promotion/results/<UTC date>-base
```

The second command reads the repeats case by case and reports the noise floor: how many cases change verdict between two runs with nothing changed. A comparison of two sets of 3 repeats flips about 1.4 to 2.3 times as many cases with nothing changed, so read its sign test and interval, not the raw flip count.

## Compare two runs

```
scripts/compare/run evals/nightly/results/<A> evals/nightly/results/<B> --treatment build
scripts/compare/run --repeats evals/nightly/results/<UTC date>-main --against evals/nightly/results/<UTC date>-pr --treatment build
```

It pairs the cases of the two runs by id and lists those that agree, flipped to better and flipped to worse, with a sign test and a bootstrap 95% interval on each main and harm metric. See [`scripts/compare/README.md`](scripts/compare/README.md).

- **The treatment.** Runs differ along five axes: `build` (the akm), `config`, `model`, `inputs` (the cases) and `harness` (the eval's version). `--treatment` names the ones B changes (default `config,model`); any other difference is refused. To compare two akm builds, say `--treatment build`.
- **The version.** Each eval's `version` is set by hand in its `src/measurement.ts`, and changed when what the eval asks akm changes. Runs of two versions are compared only with `--treatment harness`. [`MEASUREMENT_CHANGELOG.md`](MEASUREMENT_CHANGELOG.md) lists the changes.
- **Rescoring.** Every run stores each case's raw output, so `scripts/compare` and the matrix score every run again with the current scorer and labels before comparing. A scorer fix or a relabelled case needs no new run. A run that cannot be scored again (raw outputs missing, or a custom corpus outside the repository) is compared as it was scored, with a warning. `scripts/rescore/run RESULTS_DIR` does the same by hand and writes `<folder>-rescored` beside the original; it takes `--cases DIR` for a run whose cases are outside the repository.
- **Cases.** The comparison uses the cases both runs gave the same input and names the ones it left out.
- **Old results.** Results made before 0.2 have no manifest and are refused: run them again.

A comparison whose runs lack evidence for an axis, or did not complete, is labelled exploratory: shown, but not a conclusion.

## Run a matrix

`scripts/matrix/run` runs a baseline and a list of configurations, and says which configurations beat the baseline. Keep the matrix file wherever you like:

```json
{
  "prefix": "sweep",
  "model": "my-cloud-model",
  "baseline": [{ "name": "base", "eval": "reflect" }],
  "configs": [
    { "name": "low-value", "eval": "reflect", "args": ["--config-patch", "patches/low-value.json"] },
    { "name": "pr", "eval": "reflect", "args": ["--akm", "bun ~/code/akm-pr/src/cli.ts"] }
  ],
  "screen": { "limit": 20 },
  "repeats": 3
}
```

```
scripts/matrix/run sweep.json --stage screen     # every row once, with screen.limit
scripts/matrix/run sweep.json --stage confirm    # --repeat 3 for the baseline and each config the screen found different
scripts/matrix/run sweep.json --stage report     # the decision from the results so far
```

`args` are the eval's own flags (leave out `--label` and `--repeat`). A row whose `--akm` differs from its baseline's compares builds; any other axis a row changes goes in `"treatment"`, such as `"treatment": "model"`. Each stage writes `decision.md` and `decision.json` to `sweep-results/` beside the matrix file (or `--out DIR`): one row per config with its metrics against the baseline, a paired comparison of the repeats, and a verdict (better, worse, mixed, no difference, incomplete, screen only, no result, not comparable or exploratory). A metric is better or worse only when its min-max range over the repeats lies wholly on one side of the baseline's, with a gap of at least 1.25 times the wider range. A stage skips a row whose inputs have not changed, so a stopped sweep resumes. `scripts/matrix/run --help` has the rest; the metrics each eval is judged on are `EVALS` in `scripts/matrix/src/lib.ts`.

## Check the repository

```
scripts/check              # typecheck, python, test, in that order
scripts/check typecheck    # tsc in every src folder
scripts/check python       # the Harbor arm's tests, with uv
scripts/check test         # bun test at the root
```

No test needs akm or Docker: every test uses a fake akm. `.github/workflows/check.yml` runs `scripts/check` on every push and pull request. `.github/workflows/akm-smoke.yml` runs `scripts/smoke/run` nightly against real akm releases: it runs each eval once on one case against a stub model, to see that akm still takes the evals' commands (see [`scripts/smoke/README.md`](scripts/smoke/README.md)). `.github/workflows/release.yml` publishes a release from `releases/v<version>.md`, by hand.

## Custom corpora

```
./generate-assets                          # every eval
./generate-assets --only retrieval,nightly # some
./generate-assets --seed 42                # another seed, for this run
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
