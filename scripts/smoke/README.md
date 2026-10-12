# smoke

Runs each eval that drives akm once, on one case, against a stub model, to see that akm still accepts the commands the evals give it, that the JSON of `search` and `curate` is still readable, and, in the contract mode, that the evals still reach the outcomes they count as their work.

The unit tests of the evals run against fake akm scripts that print the shapes the eval expects, so they pass whatever the real akm does. The contract with akm is in those fakes and in [`COMPATIBILITY.md`](../../COMPATIBILITY.md), and nothing else checks it. This does: it runs the evals against the akm on `PATH` (or `AKM_BIN`, or `--akm`). It has two modes:

- **startup** (the default; `--strict` makes its WARNs fail) answers every model call with `{}`. A run passes when it ends and writes a summary, so it shows that akm takes the commands and that what the evals read before the model is readable. It does not show a proposal, a lesson, a memory or a verdict: every model-backed case may error.
- **contract** (`--contract`) answers every model call with a reply that is valid, and fails unless each eval reaches the outcome it counts as its work. See "Contract mode".

## Use

```
scripts/smoke/run                                   # the startup mode: every eval that can run, against the akm on PATH
scripts/smoke/run --contract                        # the contract mode
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
| `--contract` | the contract mode. It implies `--strict` |
| `--keep` | keep the results folders the runs made. They are removed otherwise |
| `--list` | print what it runs and what it skips, and why |

## Startup mode

It starts a stub model, a local server whose one endpoint, `POST /v1/chat/completions`, answers every call with the message `{}` and token counts. Then, for each eval, it runs `<eval>/run --corpus public --limit 1 --label smoke`, with the stub as `MODEL_BASE_URL` and as `JUDGE_BASE_URL`. A variable that is set wins over `.env`, so the stub is used whatever `.env` says and no key of yours is sent anywhere. It does not write `.env`.

A run **passes** when it ends and its results folder holds a `summary.json`. A model that answers `{}` makes the cases error or come out empty, so the scores mean nothing and the exit code of the run is not looked at. The smoke prints what the first row of the run says (`outcome: unusable; reason: parse_error: ...`), which is what to read. It is akm's commands, not the model, that it checks: an akm that no longer takes a flag shows as an error in the rows, or as a run that never gets to the model, and so does JSON that the eval has to read before it calls the model. It does not see the JSON akm prints after the model has answered: the `{}` makes those cases error whatever akm prints, so a change there looks like any other row.

`retrieval` calls no model, so there is no model call to count, and an akm that renames the keys of the JSON of `search` or `curate` reads as an empty answer, with no error. So `retrieval` is also checked on its answers: `search` and `curate` must each return a ref for the one query, in at least one of its results folders.

Three things look wrong and are not asserted, so they are a **WARN**, and `--strict` fails on them:

- an eval that uses a model never reached it, on the one case it was given. This is what akm refusing a command looks like from outside.
- `retrieval` got no ref from `search`, or none from `curate`, for its query. This is what a changed JSON looks like from outside.
- the stub was asked for something it does not serve, such as `POST /v1/responses`.

A run that does not end within `--timeout`, or ends without a results folder or without a `summary.json`, **fails**, and the last lines it printed follow.

## Contract mode

`scripts/smoke/run --contract` runs each eval twice on the first case of the public corpus (`--limit 1`).

**The first run** answers every model call with a reply that is valid, and the eval must reach the outcome it counts as its work. The stub reads the schema that akm sends with the call (`response_format`) and answers with the smallest value that fits it (`src/schema.ts`): the required keys, the first value of an enum, a short fixed text, the minimum of a number, one item in an array. A small table of canned replies (`CONTRACTS` in `src/contract.ts`) takes the place of that value where akm turns it down, and only there. A canned reply may be a function of the schema, so that one reply fits what two releases of akm ask for. So the run shows that akm sends the request the eval's config promises, takes the reply, and writes what the eval reads back. It then asserts what the rows say, not just that a row was written:

| Eval | The stub's replies | A row must say | The second run's row says |
|---|---|---|---|
| `evals/retrieval` | none: no model | no error, and `search` and `curate` each return a ref | there is no second run |
| `evals/judge-gate` | the value that fits: every criterion scored 1 | a verdict: `outcome` of `pass`, `review` or `reject`, with a `score` | `review`, with no `score` |
| `evals/reflect` | the value that fits: a patch of the three fields | `outcome: proposal` | `unusable` |
| `evals/distill` | a lesson with texts of a valid length (the schema of 0.9.26 asks for 10 characters, akm for 20) laid over the value that fits, which for 0.9.31 adds `reason`, `decision` (`lesson`) and `tags`; and the judge's scores at 5 on every criterion its schema names (the schema's 1 is rejected) | `outcome` of `lesson` or `update`, `status: pending` | `invalid` |
| `evals/consolidate` | a duplicate whose notes hold nothing of their own, and a second look that finds nothing missing (the value that fits lists a claim in each note, which akm never retires) | `outcome: retire`, `paired`, `judged_as: duplicate`, `staged` | `error`: the judge gave no verdict |
| `evals/extract` | the value that fits: one memory candidate | `outcome: saved` | `unusable` |
| `evals/nightly` | the pair judge of consolidate, as above | the item is `ok` (the duplicate was retired and the drain accepted it), one pair judged, no failed judgment, the improve run `ok` | the item is not `ok`, and a judgment failed |
| `evals/promotion` | the tier's judge answers `{"decision": "accept", ...}` (it sends no schema) | `outcome: accept` | `defer` |

Every row of a run of the first kind must also have no `error`, the summary must not say `aborted`, the run must exit 0, and every canned reply must have been used: one that no request matched means akm sent other requests than the table was written for, and the outcome was reached on the value that fits the schema. The output then says what akm sent instead. The `promotion` run is the one that goes through the private-state adapter: it writes the proposal into akm's `state.db`, checks that akm lists it as pending, and has the drain judge it, so an `accept` shows that the tables the eval writes still take its rows. A change to the columns shows as the eval's schema message, as in the startup mode.

**The second run** answers every call with text that is not JSON, and the eval must reach the outcome it has for a reply akm cannot read (last column). This is the explicit failure case: a run that comes out as the first kind of outcome here means akm took a reply that is no JSON, and a run that comes out as something else than that outcome means the eval no longer tells a failed reply from other things. `promotion` cannot tell an unreadable reply from a defer, as its README says, so its failure run shows `defer` and nothing more. `retrieval` calls no model and has no second run.

The scores of these runs mean nothing: the replies are not answers to the cases, and the contract never asserts `correct`.

What the contract mode does not show:

- **One case per eval.** The first of the public corpus, so one class of defect for reflect, one lesson for distill, one duplicate pair for consolidate and for the whole night. The night's reflect, distill, exact-fix and validation processes do not run: `nightly --limit 1` plants the pair only.
- **Not a model.** The replies are the same for every case, and akm's own judges are given scores to pass. It shows that an eval can reach a success and read it; it does not show that an eval separates a good model from a bad one.
- **Two releases.** The canned replies and `src/fixtures.ts` are those of akm-cli 0.9.26 and 0.9.31. The unit tests check them against the requests those releases sent, not against a live akm. When the pin moves, or a release changes a schema, run `--contract` against the new release and change the table where akm turns a reply down or asks for something else. The distill reply is laid over the schema of the request, so that one reply fits the lesson of 0.9.26 (three keys) and that of 0.9.31 (six: `reason`, `decision` and `tags` as well), and scores every criterion the judge's schema names, which is `novelty` in 0.9.26 and `reusable` from 0.9.27. The workflow runs the contract mode on the pinned release only. The latest release gets the startup mode. COMPATIBILITY.md records the releases the contract mode has passed on, 0.9.31 and a 0.10 alpha among them.
- **`evals/promotion` needs akm's embedding model**, as in the startup mode, and it is the one run here that could not be seen to reach `accept` with it. The sandbox the contract mode was written in could not reach huggingface.co. With the index built from keywords alone, which is the one local change that took the model out, the path through the adapter and the drain reached `accept` on the canned reply and `defer` on the malformed one. If the pinned leg of the workflow fails on `promotion`, read its output at the index step first: the message of akm names the model it could not load.

## What it skips

| Eval | Why |
|---|---|
| `evals/agent-ab`, `benchmarks/terminal-bench` | They need Docker. |
| `benchmarks/longmemeval`, `benchmarks/skillret` | They download a dataset. |
| `evals/bakeoff` | It runs akm, but the smoke has no canned replies for its five commands yet. |

`evals/promotion` runs, and needs akm's embedding model, which akm downloads into `.cache/models` the first time (133 MB, from huggingface.co). Without it the run fails with the message of akm. The workflow caches that folder.

## CI

`.github/workflows/akm-smoke.yml` runs two legs every night and on demand. A pull request that changes `lib/`, `evals/`, `benchmarks/`, `corpus/` or `scripts/smoke/` runs the pinned leg alone, as the check `smoke (pinned)`, which the branch protection can require:

- **pinned** runs `scripts/smoke/run --contract` against the akm-cli release that `lib/harbor/harbor.ts` pins. A leg that fails fails the workflow.
- **latest** runs `scripts/smoke/run --strict`, the startup mode, against the latest release. It is advisory (`continue-on-error`): it is where a change to akm that the evals cannot read shows up on the day it ships, and a red leg there is a reason to run `--contract` by hand against that release and read the output, not a failed check.

## Code and tests

`src/lib.ts` holds the stub, the list of evals (`ENTRIES`) and the check of one run, and `src/run.ts` the command. `src/lib.test.ts` tests them against fake run scripts. A test checks that `ENTRIES` names every folder that has a `run` script, so a new eval has to be listed, or skipped with a reason.

`src/schema.ts` builds the value that fits a schema and checks that a value does. `src/contract.ts` holds the canned replies, what each eval must say (`CONTRACTS`) and `runContract`. `src/fixtures.ts` holds the requests akm-cli 0.9.26 sent, one of each kind, as the smoke logged them, and the four that akm-cli 0.9.31 sends otherwise. `src/schema.test.ts` and `src/contract.test.ts` need no akm: they test the builder and the checker, and check every canned reply against the schemas that each release sent (it must fit, it must match a request the evals make in each, and it must differ from the value that fits, so the table holds only what akm needs said). They also run `runContract` against fake evals, and check each contract against rows copied from real runs: the row of the first run reaches the outcome and the row of the malformed run does not, and the other way round. A test checks that every eval the smoke runs has a contract, with a second run unless it calls no model. With `AKM_EVAL_REAL_AKM=1` and `AKM_BIN` naming an akm, `src/contract.test.ts` also runs the distill contract against that akm, the one whose requests differ most from one release to the next.

`src/readme.test.ts` does not test the smoke. It checks the table of evals in the root README against the code: it runs every `run --help` and compares the flags and corpora, checks the floor of akm against the `Needs akm ... or later` line, and finds every summary key the table names in the source of the eval, as a key it writes and not as any word. The help of `evals/bakeoff` is Python run by uv, so its three tests are skipped when uv is not on `PATH`, and a uv that cannot fetch PyYAML makes them fail with what uv said. It also checks that the README, `COMPATIBILITY.md` and `reports/README.md` link to files that exist. It lives here because the folder is the repository's check that its front door still matches the code.

```
cd scripts/smoke/src && bun install --frozen-lockfile && bunx tsc --noEmit -p tsconfig.json && bun test
```
