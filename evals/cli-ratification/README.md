# cli-ratification

Can a fresh agent, with the real `akm` CLI and almost no instruction, finish a task whose result is checked independently in the state it leaves behind?

Each card is one outcome ("prepare `service.json` from this project's approved values", "finish the workflow run that stopped"). The agent gets opencode in a container with `akm` installed and a seeded library, and nothing else: no plugin, no session-start injection, no warm-up. After it exits, a verifier it never saw reads the files, the bundle, akm's config and the workflow runs, and decides. The agent's own `REPORT.md` is kept as evidence and is never the verdict.

The eval exists to guide the 0.10.x CLI changes and to prune and tune the CLI surface for 0.11 ([akm#1097](https://github.com/itlackey/akm/issues/1097)). The design is `akm-agent-ratification-proposal-20261107` (pre-0.11 review, section 1C); this is its pilot, [akm-eval#210](https://github.com/itlackey/akm-eval/issues/210). It compares akm instructions with each other on one model; never put its figures beside a published benchmark score.

## Run

```
evals/cli-ratification/run --check                       # reference and no-op, no model: proves the cards and verifiers
evals/cli-ratification/run --model NAME                  # the pilot: 14 cards x 2 arms x 1 attempt = 28 trials
evals/cli-ratification/run --model NAME --limit 2        # 2 cards, once per arm: a setup check
evals/cli-ratification/run --model NAME --akm ~/code/akm # an akm checkout, packed as in agent-ab
evals/cli-ratification/generate [--check]                # rewrite tasks/ and libraries/ from src/cards.ts
```

The model flags, `--akm`, `--akm-env`, `--semantic` and what the model endpoint needs are agent-ab's (see its README). `--concurrency` defaults to 2, the pilot's width. There is no `--repeat`: **one run per eval**, one attempt per card and arm, one akm build. A repeat, or a second build, is the owner's decision. `--cases DIR` runs a folder of your own with `tasks/`, `libraries/`, `prompts/` and `arms.json`.

The default akm is `akm-cli@0.10.261111-beta`, installed alone (`lib/harbor/akm_cli.py`); no plugin is installed. Like project-intent's, it has no lockfile (`npm ci` drops its `better-sqlite3` on the containers' Node 22), so `akm_install.locked` is false and the run aborts if its containers install different trees.

## The arms

Every arm is the same container, the same akm, the same seeded bundle and the same `projects` config (`orchid` at `/work/orchid` and `quill` at `/work/quill`, paths only). They differ only in the prompt.

| Arm | What the agent is given | Scored |
|---|---|---|
| `minimal` (primary) | the wrapper below and the card, nothing else | yes |
| `guidance` | the wrapper, a fixed card of 88 words (`prompts/guidance-card.md`: what akm keeps, what a project and a ref are, where help is; no command that does a task), then the card | yes |
| `reference` | nothing: a handwritten recipe (`.solve.sh` in the card's library) runs the commands | no: validates the cards and verifiers |
| `noop` | nothing: the agent does nothing | no: a verifier that passes it checks nothing |

The wrapper is the design's, exactly (`prompts/minimal.md`, a Harbor `prompt_template_path`; the card replaces `{{ instruction }}`):

```text
AKM is installed as `akm`. Use it to complete the request below.
Work only with the disposable environment and files provided here.
You may inspect the installed tool and its shipped materials.
When finished, write REPORT.md with the outcome, what you verified,
and anything you had to guess or could not discover.

<task card>
```

`--check` runs the last two. The prompts are hashed with `arms.json` into `arms_sha256`. The shipped-plugin arm is out of scope.

## The cards

Fourteen, three for each of the first four families of the design and two regression cards. Names and values are drawn from a seeded generator (`SEED` in `src/cards.ts`), so they are fixed and reviewable; `generate` writes them as Harbor tasks and libraries, and a test regenerates them and compares. The card names an outcome and never a command. The expected values are in `tests/expected.json`, which Harbor uploads only after the agent exits.

| Family | Cards | The verifier passes it when |
|---|---|---|
| `apply` project knowledge | `service-json`, `deploy-env`, `limits-json` | the file holds exactly the working directory's project's values, with the right types and no other keys; none of the other project's values or last quarter's is in it; the workspace and the shared notes are byte for byte as given. `deploy-env` takes one value from an unscoped note, so a hard project filter would fail it |
| `persist` a decision | `canary-share`, `staging-host`, `release-address` | exactly one new asset holds the value, carries `project: <the directory's project>` (and the tag the card asks for), and a new akm process finds it with a plain search from the project's directory and shows the value |
| `repair` lookup | `stale-index`, `excluded-type`, `project-filter` | a plain search from the project's directory, in a new process, finds the gold note; the notes are unchanged; both projects are still registered. The fault is planted after the seed: a note filed after the last index, `search.defaultExcludeTypes` holding `memory`, a project filter with a typo |
| `resume` workflow | `release-3`, `release-4`, `release-last` | the workflow has one run and akm says it completed, and the receipts the steps themselves wrote hold each step exactly once, in order. A fresh run repeats the first steps and fails. The first run is planted: it stops at a step that fails once |
| `regression` | `1472-selection`, `1473-pack` | [akm#1472](https://github.com/itlackey/akm/issues/1472): the project selection akm printed for a lookup that overrides the directory's project, copied by the agent, shows the project applied (the build before the fix prints the configured one). [akm#1473](https://github.com/itlackey/akm/issues/1473): `context.jsonl` is JSON Lines, one object per line with `ref` and `content`, holding the gold ref (the build before the fix prints a pretty-printed array; a workaround counts as an outcome and shows as friction) |

A library may hold two hidden files besides its asset folders: `.plant.sh` (run once after the seed) and `.solve.sh` (the reference's recipe, copied only for the `reference` arm). Both are removed with the uploaded library before the agent starts.

## What the verifier does, and how it was tested

`verify/verify.mjs` is one script, copied unchanged into every task's `tests/`. It reads the final state and writes `reward.json` (1 only when every check passes) and `checks.json` (every check, its verdict and what it saw; the collector keeps the names of the failed ones). It runs akm as a new process with the agent's directories, never with the agent's shell.

Self-tests (`src/verify.test.ts`, no model and no Docker, against a fake container and a fake akm): every card's reference state passes and its starting state (the no-op) fails; and for the worked task, each failing case of the design: wrong project, both answers (extra keys, a list, two objects), wrong type, deleted input (an application file gone, a file changed, a shared note removed), fabricated report (REPORT.md claims the values, nothing was written), and a copied old answer (last quarter's file); and for the other families the equivalent failures (not indexed, wrong project, duplicated, missing tag; a search that still misses; a project dropped; the work done twice; a run left failed; a selection naming the configured project; an array for JSON Lines). `run --check` then proves every card against the real akm in Docker: the reference passes all 14 and the no-op fails all 14, or it exits 1.

## The trace and the measures

opencode's event stream (`agent/opencode.txt`, written by the harness) is read on the host (`src/trace.ts`). Per trial:

| Figure | Meaning |
|---|---|
| outcome pass | the verifier gave reward 1 |
| AKM-mediated pass | a pass whose evidence arrived through akm: every value in the card's `evidence` appeared in the output of an akm call before the first other call that wrote it, and one of the card's `commands` ran. Reading the bundle's files after `akm --version` is an outcome pass with mediation absent; with no trace it is unknown |
| tokens per success | every measured input and output token of all trials, failed and errored ones included, over the successes; cached tokens and trials without usage are shown apart; zero successes is undefined |
| calls to the first useful operation | tool calls up to and including the first akm call that printed a piece of evidence or ran one of the card's commands (and the seconds to it) |
| help and shipped files read | `akm help`, `akm hints` and any `-h`/`--help` (calls and characters printed); reads of files under `akm-cli/` |
| invalid and repeated commands | akm calls that exited 2 or printed a usage error code; akm calls typed again exactly |
| akm output | characters akm printed to the agent |

There is no composite score. `summary.json` has the figures per arm and per family, the paired difference of the arms with lib/harbor's bootstrap and sign test (14 cards: read the counts), and for each failed trial the checks that failed.

## Classify before you change anything

Every failed or errored trial gets one class, from its failed checks, its trace and `REPORT.md`, before akm is touched:

| Class | Treatment |
|---|---|
| leakage or a bad verifier | the trial is invalid: fix the instrument and run it again fresh |
| infrastructure unavailable | an unscored setup error, shown as such, never dropped |
| supported package or runtime defect | a product finding, even before the agent started |
| discovery or docs; execution or recovery | read the contract, the help and the trace for the specific repair |
| model decision or outlier | stays an outcome failure; watch for it again |
| generated knowledge quality | belongs to the quality evals, not to CLI fluency |

A valid alternative workflow passes. A timeout fails unfinished work. A known product failure (the regression cards on a build without the fixes) stays a failure, not a skip.

## Pass rule

Two gates, read in this order. The pilot decides whether the instrument works, and where to look; the 0.11 dispositions (Stable, Experimental, remove) need the design's screening and release stages, not this run.

1. **The instrument.** `run --check` exits 0 on the same cards, libraries and akm (reference 14/14, no-op 0/14). The model run is `complete`: all 28 trials have a result, no arm errored in every trial, every container installed the same tree. Every failed trial has a class, and a trial classed as leakage or a bad verifier is run again before anything is read. Any of these missing: no result.
2. **The reading.** `minimal` is primary. For each family, report outcome passes and AKM-mediated passes out of its cards, never a pooled number. A family is *clear* when `minimal` passes all its cards through akm; *instruction-dependent* when `guidance` passes what `minimal` fails; a *product-defect candidate* when both fail it and the class is a defect, discovery or execution failure. `guidance` tokens per success more than 10% over `minimal`'s is a review line (the design's). The regression cards must pass on a build that has the fixes. The first run has nothing to compare with: a later run on another build compares card by card.

## Limits of the pilot

- Isolation is the container and Harbor's upload of `tests/` after the agent. Not built yet: a probe of unreadable canary paths and blocked network egress from inside the measured container (the model gateway and npm are reachable), a cap of 40 tool actions per trial (trials over it are counted, not stopped), and a trace the agent cannot write (`agent/` is a mount the agent's shell can reach). Do not read the first run as isolated until the owner has decided on these.
- Receipts are files the workflow's steps write in the working directory; an agent that forges them is caught only by the run's state in akm.
- The pilot's 12 minutes are the agent's (`[agent] timeout_sec`); the install is not counted.
- 14 cards, one attempt: the sign test and the intervals are wide. Count cards, then read the traces.
- Families 5 to 12, semantic retrieval, native scheduling, a second harness and held-out cards are not here.

## What the summary reports

`summary.json`: `mode` (`pilot` or `check`), `status`, `aborted_reason`, `check` (the verdict of a `--check` run), `completion` per arm, `arms`, `metrics`, `report` (the full figures and the per-card table), `pins` (no plugin), `akm_version`, `akm_install`, `libraries_sha256`, `tasks_sha256`, `arms_sha256`, `assets_sha256`, `job` and the `manifest`. `samples.jsonl`: one line per card with every trial (reward, failed checks, mediated, the trace, tokens, time). A run that did not finish everything is `aborted`, exits 1, and is no result. To publish a run, copy its `summary.json` and `samples.jsonl` to `reports/<akm version>/cli-ratification/<run>/` and add its row to `reports/README.md`.

## Licence

MPL-2.0.
