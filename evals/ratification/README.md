# ratification

Does a fresh agent complete everyday akm jobs, recover when one goes wrong, and avoid needless calls: with the akm CLI alone, with the guide akm ships for agents, and with the akm plugin? This is the agent ratification of [akm#1629](https://github.com/itlackey/akm/issues/1629), made repeatable so it can be run again on the 0.11 candidate. Like [cli-ratification](../cli-ratification/README.md) it compares akm instructions with each other on one model; never put its figures beside a published benchmark score.

Every trial is opencode in a Docker container through Harbor, with `akm` installed and a seeded, indexed bundle. A verifier it never saw reads the container state afterwards (files, the bundle, akm's `state.db`) and decides; no model judges.

## Run

```
evals/ratification/run --check                                   # reference and no-op, no model: proves the tasks and verifiers
evals/ratification/run --model opencode/qwen3.8-flash --tasks find--prod-port,doctor--stuck-run --label pilot
evals/ratification/run --model opencode/qwen3.8-flash --concurrency 4        # 9 tasks x 3 arms x 3 attempts = 81 trials
evals/ratification/run --model NAME --akm akm-cli@0.10.261120   # another akm: an exact release, or a checkout (packed as in agent-ab)
evals/ratification/generate [--check]                            # rewrite tasks/ and libraries/ from src/tasks.ts
```

`--model` is required and is resolved as in the other evals; `opencode/<id>` is an OpenCode Zen model and reads `OPENCODE_API_KEY` (Zen's key, which `.env` may hold as `ZEN_API_KEY`: nothing maps that name, so export it as `OPENCODE_API_KEY` for the run; a gateway's key is checked with `GET /models` before the first container, and a 401 or 403 stops the run). `--akm`, `--akm-env` and `--semantic` are agent-ab's. The default is the current stable, `akm-cli@0.10.261120`, with the plugin `RELEASE_PLUGINS` pairs it with (`akm-opencode@0.10.261122`). For the 0.11 candidate give its release or checkout; add its pair to `RELEASE_PLUGINS` in `lib/harbor/harbor.ts` first, and check the tasks' reference forms against the candidate's `docs/reference/cli.md` (`run --check` fails a task whose reference no longer works).

## The arms

Same container, same akm-cli, same seeded bundle, the same `.plant.sh` run after the seed. They differ only in what the agent is given.

| Arm | What the agent is given |
|---|---|
| `minimal` | the task's instruction and one line: ``The `akm` CLI is installed.`` (`prompts/minimal.md`). Nothing else |
| `guided` | `minimal`, and `akm hints` (the guide akm ships for agents, the short one) written to `/work/AGENTS.md` at setup, which opencode reads as the project's instructions. akm's text, none of ours |
| `plugin` | `minimal`, and the akm-opencode plugin, loaded the way agent-ab's akm arm loads it: a warm-up session checks it loaded, and the measured session's log is checked after. A trial whose plugin was not shown to be live is an error with no reward. The plugin's tools are `akm_search`, `akm_show`, `akm_curate`, `akm_feedback` and `akm_remember`; its session-start hints and curation are on, background learning is off |
| `reference` | `--check` only: the task's minimal command sequence (`.solve.sh`) runs, no model |
| `noop` | `--check` only: nothing runs. A verifier that passes it checks nothing |

Web tools are off in the model arms. The agent's working folder is `/work`.

## The tasks

Nine everyday jobs, each with a verifier over the final state and a reference solution (`src/tasks.ts` is the source; `tasks/` and `libraries/` are generated from it and a test compares them). The bundle holds seven short notes about made-up services and one task asset.

| Task | The job | The verifier passes it when | Reference akm calls |
|---|---|---|---|
| `find--prod-port` | find a note and read a value | `/work/answer.txt` holds the production port (the note also holds a staging and a metrics port) | `search`, `show` (2) |
| `remember--retention` | remember a fact with a description and tags | a memory in the bundle holds the fact, with that description and both tags | `remember --description --tag --tag` (1) |
| `import--handoff` | import a file as knowledge | a knowledge document holds the file's marker and a search for "handoff" finds it | `import` (1) |
| `feedback--stale-note` | flag a wrong note | a negative feedback event on the note carries a reason that says Thursday | `feedback --negative --reason` (1) |
| `run--stamp-release` | run a task asset | `/work/release.stamp` is right and `state.db` has a completed run of the task | `search --type task`, `run <ref>` (2) |
| `doctor--stuck-run` | inspect health | `/work/health.txt` holds the id of the one stuck run `akm doctor` reports (planted) | `doctor` (1; exits 4, a health warning) |
| `proposal--review` | review proposals | the proposal that matches the changelog is accepted and applied, the other is rejected and its note unchanged (two planted) | `proposal list`, `diff` x2, `accept`, `reject --yes` (5) |
| `clone--canary-note` | clone a note, edit the copy | the clone holds the new port, the original is unchanged, `akm show` reads the clone | `import <ref> --asset-ref --name` (1) |
| `validate--draft-task` | check a task file | `/work/validity.txt` says invalid and no task was added to the bundle | `import <file> --type task` (1, fails: the answer) |

The last two and `run--stamp-release` and `doctor--stuck-run` are the recovery cases: the form an agent reaches for first is deprecated or gone in 0.10.261120. `akm clone`, `akm task run` and `akm health` still work and print a `[deprecated]` notice naming the replacement (`import --asset-ref`, `akm run`, `akm doctor`); `akm task validate` (still listed as current in docs/reference/cli.md) is an unknown command, whose hint points at `akm task --help`. The forms come from STABILITY.md and docs/reference/cli.md at akm `origin/main`. Proposals cannot be queued by any command without a model, so the plant script calls akm's own `createProposal`, as its improve stages do; it is coupled to akm-cli's internals and is the first thing to check on a new release.

## The measures

Per trial, from opencode's event stream (`agent/opencode.txt`, `src/metrics.ts`): completed (the verifier's reward), akm calls (the plugin's tools and shell commands that run akm) and other tool calls, **unnecessary** calls (akm calls beyond the reference's), errors (an akm call that failed; `doctor`'s exit 4 is an answer), whether the agent **recovered** (it hit an error and still passed, with a successful akm call after it), deprecated forms (a `[deprecated]` notice, or the task's `old` pattern) and whether it moved on to the replacement, help lookups (`akm help`, `hints`, `--help`), repeated and usage-error calls, tokens. The report gives each per arm and per task and arm. There is no composite score and no significance test: nine tasks and three attempts give counts and means; read the transcripts (`samples.jsonl` keeps the akm commands in order).

A failed or errored trial gets a class before akm is touched, as in cli-ratification: a bad verifier or leaking task (invalid, fix and run again), infrastructure, a product defect, discovery or execution, a model decision.

## What the summary reports

`summary.json`: `mode` (`run` or `check`), `status`, `aborted_reason`, `check`, `completion` per arm, `model`, `engine`, `pins`, `akm_version`, `akm_install`, `tasks_sha256`, `libraries_sha256`, `prompt_sha256`, `assets_sha256`, `job` config (credentials redacted) and `report` (per arm and per task). `samples.jsonl`: one line per trial. A run that did not finish every cell is `aborted`, exits 1 and is no result. Results are not published by this eval: copying them to `reports/` is the owner's step.

## Licence

MPL-2.0.
