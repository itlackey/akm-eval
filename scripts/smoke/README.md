# smoke

Runs each eval that drives akm once, on one case, against a stub model, to see that akm still accepts the commands the evals give it and, for `retrieval`, that the JSON of `search` and `curate` is still readable.

The unit tests of the evals run against fake akm scripts that print the shapes the eval expects, so they pass whatever the real akm does. The contract with akm is in those fakes and in [`COMPATIBILITY.md`](../../COMPATIBILITY.md), and nothing else checks it. This does: it runs the evals against the akm on `PATH` (or `AKM_BIN`, or `--akm`).

## Use

```
scripts/smoke/run                                   # every eval that can run, against the akm on PATH
scripts/smoke/run --akm "bun ~/code/akm/src/cli.ts" --strict
scripts/smoke/run --only reflect,retrieval
scripts/smoke/run --skip promotion
scripts/smoke/run --list                            # what it runs and what it skips
```

| flag | |
|---|---|
| `--only A,B` | run these only, by folder name (`reflect`, `retrieval`, ...) |
| `--skip A,B` | run all but these |
| `--akm COMMAND` | the command that runs akm. Default: `AKM_BIN` in `.env`, else `akm` on `PATH` |
| `--timeout SEC` | stop an eval that is still running after SEC seconds (default 900) |
| `--strict` | fail on a WARN too |
| `--keep` | keep the results folders the runs made. They are removed otherwise |
| `--list` | print what it runs and what it skips, and why |

It starts a stub model, a local server whose one endpoint, `POST /v1/chat/completions`, answers every call with the message `{}` and token counts. Then, for each eval, it runs `<eval>/run --corpus public --limit 1 --label smoke`, with the stub as `MODEL_BASE_URL` and as `JUDGE_BASE_URL`. A variable that is set wins over `.env`, so the stub is used whatever `.env` says and no key of yours is sent anywhere. It does not write `.env`.

A run **passes** when it ends and its results folder holds a `summary.json`. A model that answers `{}` makes the cases error or come out empty, so the scores mean nothing and the exit code of the run is not looked at. The smoke prints what the first row of the run says (`outcome: unusable; reason: parse_error: ...`), which is what to read. It is akm's commands, not the model, that it checks: an akm that no longer takes a flag shows as an error in the rows, or as a run that never gets to the model, and so does JSON that the eval has to read before it calls the model. It does not see the JSON akm prints after the model has answered: the `{}` makes those cases error whatever akm prints, so a change there looks like any other row.

`retrieval` calls no model, so there is no model call to count, and an akm that renames the keys of the JSON of `search` or `curate` reads as an empty answer, with no error. So `retrieval` is also checked on its answers: `search` and `curate` must each return a ref for the one query, in at least one of its results folders.

Three things look wrong and are not asserted, so they are a **WARN**, and `--strict` fails on them:

- an eval that uses a model never reached it, on the one case it was given. This is what akm refusing a command looks like from outside.
- `retrieval` got no ref from `search`, or none from `curate`, for its query. This is what a changed JSON looks like from outside.
- the stub was asked for something it does not serve, such as `POST /v1/responses`.

A run that does not end within `--timeout`, or ends without a results folder or without a `summary.json`, **fails**, and the last lines it printed follow.

## What it skips

| Eval | Why |
|---|---|
| `evals/agent-ab`, `benchmarks/terminal-bench` | They need Docker. |
| `benchmarks/longmemeval`, `benchmarks/skillret` | They download a dataset. |
| `evals/bakeoff` | It never runs akm. |

`evals/promotion` runs, and needs akm's embedding model, which akm downloads into `.cache/models` the first time (133 MB, from huggingface.co). Without it the run fails with the message of akm. The workflow caches that folder.

## CI

`.github/workflows/akm-smoke.yml` runs `scripts/smoke/run --strict` every night and on demand, twice: against the akm-cli release that `lib/harbor/harbor.ts` pins, and against the latest release. The second is where a change to akm that the evals cannot read shows up on the day it ships.

## Code and tests

`src/lib.ts` holds the stub, the list of evals (`ENTRIES`) and the check of one run, and `src/run.ts` the command. `src/lib.test.ts` tests them against fake run scripts. A test checks that `ENTRIES` names every folder that has a `run` script, so a new eval has to be listed, or skipped with a reason.

`src/readme.test.ts` does not test the smoke. It checks the table of evals in the root README against the code: it runs every `run --help` and compares the flags and corpora, checks the floor of akm against the `Needs akm ... or later` line, and finds every summary key the table names in the source of the eval, as a key it writes and not as any word. The help of `evals/bakeoff` is Python run by uv, so its three tests are skipped when uv is not on `PATH`, and a uv that cannot fetch PyYAML makes them fail with what uv said. It also checks that the README, `COMPATIBILITY.md` and `reports/README.md` link to files that exist. It lives here because the folder is the repository's check that its front door still matches the code.

```
cd scripts/smoke/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
