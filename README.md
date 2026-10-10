# akm-eval

One public repository for every akm evaluation and benchmark.

It holds our own evals, the published benchmarks we run akm against, and a public akm library the evals use: a snapshot of the shared bundle our lab's agents read. Every eval runs the same way against any OpenAI-compatible model, local or cloud.

This layout replaces the earlier harness. The old content stays under the tag `legacy-2026-10`.

## Evals and benchmarks

Each row is a folder, the question it answers, which corpora it has, and its status. The library and the evals marked ready exist today. The others are planned, and each will follow the layout and commands below.

| Folder | Question it answers | Corpus | Status |
|---|---|---|---|
| `corpus/library` | The public akm library the evals use: a snapshot of our lab's shared bundle | public | ready |
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | public + private | ready |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | public + private | ready |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | public + private | ready |
| `evals/distill` | Do distilled lessons say only what the source memory says? | public + private | ready |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | public + private | ready |
| `evals/extract` | Does extraction pull durable insights and preferences from session logs, and leave routine sessions empty? | public + private | ready |
| `evals/nightly` | Does a full nightly improve run give good results unattended, with no model-call failures? | public + private | ready |
| `evals/promotion` | Of the promotions consolidate proposes, how many does the drain's judgment tier accept, and are those the good ones? | public + own | ready |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | public + private | ready |
| `evals/bakeoff` | Which model runs akm's model-backed jobs best: valid output, correct facts, real quotes, speed? | public + private | ready |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | public (fetched) + private | ready |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | public (fetched) + private | ready |
| `benchmarks/skillret` | Given a request, does akm rank the right skills first from a large skill library (SkillRet)? | public (fetched) + private | ready |

Older evals and experiments that were retired instead of moved in are summarised in [`reports/retired-evals.md`](reports/retired-evals.md): what each asked, what it found, why it ended, and what covers the question now.

## Layout

```
README.md          this file
LICENSE            MPL-2.0, for everything here
NOTICE             third-party items under their own licences
generate-assets    makes every eval's private assets in private/
.env.example       model and judge settings
corpus/library/    the shared akm bundle (a working akm library)
evals/             our evals
benchmarks/        published benchmarks
lib/akm/           the akm sandbox the evals that use akm share
lib/models.ts      --model, --judge-model and models.json: which model a run uses, and whether it may see your private notes
lib/harbor/        the akm arm, the job and the report of the evals that run opencode in Harbor with and without akm
lib/rewrite/       the seeded rewrite the generate scripts share
scripts/matrix/    runs a matrix of eval configurations in two stages and writes a decision table
reports/           published results: scores only, never private items
retired/           code of retired evals, kept to read and never run here
private/           your private assets (gitignored, never published)
.cache/            akm's embedding model, downloaded once, and the semantic indexes the evals keep between runs (gitignored)
```

## Run an eval

Every eval and benchmark has a `run` script:

```
evals/retrieval/run --corpus public
evals/retrieval/run --corpus private
evals/retrieval/run --corpus all
```

`--corpus` picks the assets. `all` runs both and shows the public and private results side by side.

Models come from `.env`. Copy `.env.example` to `.env` and fill it in.

- `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME` set the model under test.
- `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL` set the judge.

Any OpenAI-compatible endpoint works, local or cloud. `.env` is gitignored.

### Pick the model and the akm build of a run

Point `.env` at one gateway, such as `MODEL_BASE_URL=https://gateway.example.com/v1`, and name the model of each run with `--model`, the gateway's model id. No script or environment override is needed to switch models:

```
evals/consolidate/run --corpus public --model my-cloud-model --repeat 3
evals/reflect/run --model my-small-model --akm "bun ~/code/akm/src/cli.ts" --label pr1100-1
benchmarks/longmemeval/run --model my-model --judge-model my-small-model
```

- `--model ID` is on every eval and benchmark that runs a model, `--judge-model ID` on the ones that grade with one (`benchmarks/longmemeval`, `evals/retrieval/label`), and `--akm COMMAND` on every one that runs akm. They win over `MODEL_NAME`, `JUDGE_MODEL` and `AKM_BIN`, which still work. `summary.json` records the model and the akm build as before.
- A judge with no `JUDGE_BASE_URL` uses the model's endpoint and key.
- A model that is not behind the gateway (another provider, a server of its own), or a gateway model that may see your private notes (a line with the gateway's `base_url`), takes a line in `models.json` beside `.env`, gitignored, copied from `models.example.json`: `{ "name": { "base_url": "...", "api_key_env": "OPENAI_API_KEY", "model": "...", "private": true } }`. `--model name` then goes to that URL with the key held in that environment variable (set it in `.env`). `model` is the name the endpoint expects, if it is not the line's name. A key never goes in `models.json`. `"private": true` says that your private notes may go to this model (see the private evals below); it is false when left out.
- In a matrix file, `"model"` and `"akm"` at the top set `--model` and `--akm` for every row (`model` not for retrieval, which uses none). A row's own `--model` or `--akm` in its `args` wins.
- `evals/bakeoff` compares models from its own `--models FILE`. `evals/agent-ab` and `benchmarks/terminal-bench` take `--model` as opencode names the model.
- `AKM_BIN` and `--akm` take a command, and a leading `~/` in a word is your home folder.

`nightly`, `consolidate`, `distill`, `reflect` and `promotion` also take `--strategy NAME` and `--config-patch FILE`, to run an akm strategy or a config other than the eval's own; `summary.json` records both.

Each eval's README says what else it needs. An eval with Python code needs [uv](https://docs.astral.sh/uv/). An eval that uses akm needs akm on `PATH`, or `AKM_BIN` set in `.env`. One that scores akm's semantic search also downloads akm's embedding model (133 MB) the first time, into `.cache/`, and keeps the semantic index it builds there, in `.cache/akm-index/`, for the next run.

## Test an unreleased akm

To run an eval against a checkout or a worktree of akm, set `AKM_BIN` to the command that runs it, in `.env` or for one run (a variable that is already set wins over `.env`):

```
AKM_BIN="bun ~/code/github/itlackey/akm/src/cli.ts" evals/retrieval/run --corpus public --label pr1071-1
```

`summary.json` records `akm_version`, which is the version akm prints, so a PR branch and the release it branched from can show the same one. It also records `akm_bin` (the `AKM_BIN` command, with your home folder written as `~`) and `akm_build` (`git describe --always --dirty` of the checkout that command runs from, or null for an installed release). Read those to tell two builds apart, and compare only runs of the same build. Also put the build in `--label`, and keep a notes file next to the results of a set of runs, saying what each label tested. The results folder is `<UTC date>-<label>`: in the evening in the Americas the UTC date is already tomorrow's, and the same label on another day is another folder, so a glob on the label can match both.

## Repeat a run

A model's answers differ by a case or two from one run to the next, so one run cannot tell a change from noise. `retrieval`, `judge-gate`, `reflect`, `distill`, `consolidate`, `extract`, `nightly` and `promotion` under `evals/` take `--repeat N`, which runs the corpus N times, each a whole run into its own results folder, `<UTC date>-<label>-r1` to `-rN`, with the usual `summary.json`. Beside them it writes `<UTC date>-<label>-repeat-summary.json`: the same `metrics` as a summary, with every number replaced by its `min`, `max` and `mean` over the runs, and the same three for `n_errored` and `seconds` (the wall time of each run), because a spread over runs that had errors misleads without them. A run without `--repeat` is unchanged. With `--repeat` the side-by-side table of `--corpus all` is not printed; read each corpus's repeat summary. The code is `lib/repeat.ts`.

```
evals/promotion/run --corpus public --repeat 4 --label pr1071-2
```

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

`args` are the eval's own flags. A relative `--config-patch` path is from the matrix file's folder. Leave out `--label` and `--repeat`: the runner sets them. A config is compared with the baseline that runs the same cases (the same eval, `--corpus`, `--pool`, `--cases` and `--limit`), so give one baseline per eval and mode; the corpora are never pooled. `screen.limit` is a number for every eval, or one per eval, and does not apply to `--pool` runs. The model and the akm build are the run's own: `.env` and `AKM_BIN`, or the file's top-level `"model"` and `"akm"`, which become `--model` and `--akm` of every row (see "Pick the model and the akm build of a run").

```
scripts/matrix/run sweep.json --stage screen                  # every row once, label <prefix>-<name>-s
scripts/matrix/run sweep.json --stage confirm                 # --repeat 3 for the rows that differ, label <prefix>-<name>-c
scripts/matrix/run sweep.json --stage confirm --only low-value
scripts/matrix/run sweep.json --stage report
```

`--parallel N` runs rows of different evals at the same time; two runs of one eval never overlap. A stage skips a row it already ran with the same arguments (`--force` runs it again), so a stopped sweep resumes. `--dry-run` prints what a stage would run. `--min-delta X` sets how much a screen result must move to count as different (default 0: any change in a main or harm metric); `--only A,B` confirms the named configs whatever the screen said.

Each stage writes `decision.md` and `decision.json`, beside `state.json` and the runs' `logs/`, in `<matrix name>-results/` next to the matrix file (or `--out`). One row per config: the main metrics and the harm metrics, baseline against config, as mean and min-max over the repeats, the model calls and seconds, the akm build and the model, and a verdict. The metrics of each eval are in `EVAL_METRICS` in `scripts/matrix/src/lib.ts`, each with its direction: nightly `items.rate`; consolidate (also `--pool`) `recall.value` and `precision.value`, harm `unsafe.n`; distill `good_lessons.rate`, harm `wrong_lessons.rate`; reflect `defects.rate`, harm `controls.rate` falling and `proposals.touched_body`; promotion `precision.value` and `recall.value`, harm `bad_accepted.value`; judge-gate `precision.value` and `good.rate`, harm `bad.rate`; extract `insights.rate`, harm `routine.rate` falling and `planted.saved_instruction`; retrieval `ndcg_10` of each column, per collection.

The decision rule is the plan's for akm's 0.10 defaults:

- better: a main metric's min-max range over the repeats does not overlap the baseline's, on the better side, and no harm metric rose (a harm metric whose range is clearly lower also counts as better);
- worse: a main metric clearly below, or a harm metric above the baseline's mean (harm must not rise);
- mixed: both a better and a worse metric;
- no difference: neither;
- screen only: a run with one repeat. A screen cannot tell a change from noise, so it only picks what to confirm;
- no result (a run wrote no scored summary) and not comparable (the baseline and the config ran another model or akm build) are the other two.

## Stop or wait for a run

While a run is alive, its results folder holds a `.running` file with the pid of the process that writes it, and the process removes the file when it ends, however it ends (a failure, Ctrl-C, `kill`). Every eval and benchmark that makes a results folder does this (`lib/results.ts`, and the same few lines in `evals/bakeoff`). With `--repeat`, each folder loses its file when that run is done, so a script that waits for `-r1` sees it end while `-r2` runs.

```
kill $(cat evals/promotion/results/<UTC date>-<label>/.running)         # stop the run
while [ -e evals/promotion/results/<UTC date>-<label>/.running ]; do sleep 10; done   # wait for it
```

A run that was killed with `kill -9`, or by a power cut, leaves the file behind: `kill -0 $(cat <dir>/.running)` fails when no such process is alive. A folder with no `.running` and no `summary.json` is a run that stopped before it wrote its result.

## Run from a worktree

A new git worktree of this repository has no `.env` (gitignored) and no `private/` link, so `run` fails until you copy the first and link the second:

```
cp ~/code/github/itlackey/akm-eval/.env .env
ln -s ~/code/github/itlackey/akm-eval/private private
```

Public results are written inside the worktree, under `evals/<name>/results/`, and removing the worktree removes them. Commit them to akm-eval-private or copy them out first. Private and own results are written through the link, to `private/`, and stay there uncommitted until you commit them.

## Private assets

Private assets are made from the public ones with a seed, by the rewrite in `lib/rewrite`, so a model can be tested on assets it cannot have trained on. The rewrite changes:

- names, and the names of tools, products and projects (Docker, GitHub, Qwen, akm), in every form they are written;
- hosts, addresses, ports, ids and dates;
- numbers and versions, such as counts, sizes, durations and percentages. Each keeps its order relative to the others, its digits and its range, so "up from 18 to 21" stays an increase and a percentage stays between 0 and 100.

It leaves the ordinary prose, the words a text rests on (programming languages, file formats, protocols, operating systems and core commands: Python, TypeScript, JSON, YAML, Markdown, HTTP, SQL, git, npm, bash), single digits, years, HTTP status codes, step and list numbers, and hosts under well-known domains. Every label, case and expected answer goes through the same mapping as its text, so the meaning and the difficulty stay the same, and the `generate` of each eval whose labels depend on the text checks that they still hold. `lib/rewrite/README.md` has the full lists.

Most of a text is prose, so a private copy differs from its public one by a few percent of its words: about 3 to 5 percent for the evals, about 1 percent for LongMemEval, which keeps its numbers (`--keep-values`) because its answers are counted from the text.

```
./generate-assets                          # make private assets for every eval
./generate-assets --only retrieval,nightly # make them for some evals
./generate-assets --seed 42                # use this seed for one run
```

The first run creates `private/` and `private/seed`, a random 64-bit integer. `private/` is gitignored. It is never published, so never commit it or upload it.

Each eval's `generate` script gets `--seed <seed> --out private/<name>`. The scripts share the rewrite in `lib/rewrite`. It needs [bun](https://bun.sh).

Run private evals on a local model, or on an API that does not train on your data. A private-corpus eval (`--corpus own`) uses a model only if its line in `models.json` says `"private": true`, and refuses any other, including a gateway model with no line. Nothing infers it from a URL or a name: you say which models may see your notes. A model may have seen the public assets in training. A gap between the public and private scores points to that.

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
