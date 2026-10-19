# smoke

Runs each eval that drives akm once, on one case, against a stub model, to see that a real akm still takes the evals' commands and that the evals still read what it prints. The unit tests use fake akm scripts and pass whatever the real akm does; this is the check against the real one (`PATH`, `AKM_BIN` or `--akm`).

## Use

```
scripts/smoke/run                                   # startup mode, against the akm on PATH
scripts/smoke/run --contract                        # contract mode
scripts/smoke/run --akm "bun ~/code/akm/src/cli.ts" --strict
scripts/smoke/run --only reflect,retrieval
scripts/smoke/run --list                            # what it runs and skips
```

| flag | |
|---|---|
| `--only A,B`, `--skip A,B` | run only these, or all but these, by folder name |
| `--akm COMMAND` | the akm to run. Default: `AKM_BIN` in `.env`, else `akm` on `PATH` |
| `--timeout SEC` | stop an eval still running after SEC seconds (default 900) |
| `--strict` | fail on a WARN too |
| `--contract` | the contract mode; implies `--strict` |
| `--keep` | keep the results folders the runs made |
| `--list` | print what it runs and skips, and why |

Each eval runs as `<eval>/run --corpus public --limit 1 --label smoke` (bakeoff uses `--limit 5`, one case per process), with a local stub as `MODEL_BASE_URL` and `JUDGE_BASE_URL`, so no key of yours is sent anywhere.

## Startup mode

The stub answers every call with `{}`. A run passes when it ends and writes a `summary.json`; the scores mean nothing, and the smoke prints what the first row says. It shows that akm accepts the commands and that the JSON read before the model call is readable. `retrieval` calls no model, so `search` and `curate` must each return a ref.

A WARN, which `--strict` fails on: an eval that uses a model never reached it (akm refused a command), `retrieval` got no ref, or the stub was asked for something it does not serve.

## Contract mode

Each eval runs twice. The first run answers every call with the smallest value that fits the schema akm sent (`src/schema.ts`), or a canned reply where akm turns that down (`CONTRACTS` in `src/contract.ts`), and the eval must reach the outcome it counts as its work. The second run answers text that is not JSON, and the eval must reach its outcome for an unreadable reply.

| Eval | First run's row must say | Second run's row says |
|---|---|---|
| `evals/retrieval` | no error; `search` and `curate` each return a ref | no second run |
| `evals/judge-gate` | `outcome` of `pass`, `review` or `reject`, with a `score` | `review`, with no `score` |
| `evals/reflect` | `outcome: proposal` | `unusable` |
| `evals/distill` | `outcome` of `lesson` or `update`, `status: pending` | `invalid` |
| `evals/consolidate` | `outcome: retire`, `paired`, `judged_as: duplicate`, `staged` | `error` |
| `evals/extract` | `outcome: saved` | `unusable` |
| `evals/nightly` | the item is `ok`, one pair judged, none failed | the item is not `ok`, a judgment failed |
| `evals/promotion` | `outcome: accept` | `defer` |
| `evals/bakeoff` | `outcome: output` for all five processes | `unusable` |

The first run must also have no row error, no `aborted`, exit 0, and use every canned reply: an unused one means akm sent requests the table was not written for. The canned replies are checked against the pinned release (`0.10.261003-beta`). Bakeoff uses five cases, one per process; the others use one case and one reply for all cases: it shows that an eval can reach and read a success, not that it tells a good model from a bad one. `evals/promotion` needs akm's embedding model (133 MB from huggingface.co, kept in `.cache/models`).

## What it skips

`evals/agent-ab` and `benchmarks/terminal-bench` (Docker), `benchmarks/longmemeval` and `benchmarks/skillret` (they download a dataset).

## CI

`.github/workflows/akm-smoke.yml` runs every night and on demand: `--contract` on the akm-cli release pinned in `lib/harbor/harbor.ts` (must pass), and `--strict` on the latest release (advisory). Every pull request runs the pinned leg as the check `smoke (pinned)`.

## Code and tests

`src/lib.ts` holds the stub, the list of evals (`ENTRIES`) and the check of a run; `src/run.ts` the command; `src/schema.ts` and `src/contract.ts` the contract mode; `src/fixtures.ts` the requests akm 0.9.26 and 0.9.31 sent. The tests need no akm. With `AKM_EVAL_REAL_AKM=1` and `AKM_BIN` set, `src/contract.test.ts` also runs the distill contract against that akm.

`src/readme.test.ts` checks the root README's table of evals against every `run --help`, the akm floors in `COMPATIBILITY.md` against the `Needs akm ... or later` lines, and the links of the top-level documents.

```
cd scripts/smoke/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
