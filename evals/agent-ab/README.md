# agent-ab

Does the akm plugin change how often an agent completes tasks where retrieval is the only way in, and does the agent actually call akm?

An agent can use only what it was trained on and what it is shown. These tasks are about tools that do not exist, or that the model does not get right unaided: their command forms, flags and file formats are written in a small akm library and nowhere else. Each task runs twice, with [opencode](https://opencode.ai) alone and with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), on the same model. A task passes when its verifier accepts what the agent left in the working folder. The eval reports each arm's pass rate, the difference between them, and whether the agent called an akm tool at all: a plugin that is offered and never used cannot be what changed a result.

This task set is ours. It answers one question, akm against itself, and gives no figure to put next to a published benchmark. See "Comparing results".

## Run

```
evals/agent-ab/run --corpus public
evals/agent-ab/run --corpus private
evals/agent-ab/run --corpus all
evals/agent-ab/run --repeat 3
evals/agent-ab/run --akm ~/code/akm --akm-env AKM_CURATE_TIMEOUT=30
```

- `--corpus` picks the tasks. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N tasks, spread over the task families, once per arm. Use it to check a setup. Without it every task runs three times per arm.
- `--model NAME` is the model, as opencode names it. It wins over `MODEL_NAME`. See "What it needs".
- `--repeat N` runs the whole eval N times, into `<label>-r1` to `<label>-rN`, and writes the min, max and mean of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. Nine tasks are few: a run differs from the next by a task or two, and a change smaller than that spread is not a change. With `--corpus all` each corpus is repeated on its own and the two are not printed side by side.
- `--akm akm-cli@x.y.z|FOLDER` is the akm of the akm arm, and `--akm-env KEY=VALUE` (repeatable) adds a setting to its environment. See "Which akm".
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The private run reads `private/agent-ab/assets/`. Make it first with `./generate-assets --only agent-ab`. The run stops with an error when it is missing.

Each run writes to `evals/agent-ab/results/<UTC date>-<label>/`, or to `private/agent-ab/results/` for the private corpus:

- `summary.json`: the report described below, the model, the pins, how many tasks and attempts ran, the corpus and the git commit. It also holds:
  - `akm_version`, `akm_bin`, `akm_build`, `akm_env` and `akm_install`: which akm the akm arm ran, and what was installed. See "Which akm".
  - `job`: the Harbor job that ran, from `job.json`: the tasks (`datasets`), the attempts, the concurrency (4), the setup time (2,700 seconds) and the options of both agents, opencode's config among them. Paths are relative to the run's folder or the repository. `libraries_sha256` is a digest of the libraries folder.
  - `timeouts` (`control` and `akm`), `n_errored` (the errored trials of both arms) and `metrics`: the report's main numbers as plain numbers, per arm (`pass_rate`, `passed`, `scored`, `errored`, `timeouts`, minutes and dollars per scored trial), the `delta` (akm minus control, with its interval and the number of tasks), `better` and `engagement` (`rate`, `called`, `curated_read`, `control_calls`). `--repeat` takes the spread of `metrics`.
- `samples.jsonl`: one line per trial, with its task, arm, reward, exception if any, whether it ran out of time (`timed_out`), the akm tools it called, its tokens and its time. A trial whose plugin was not live has `plugin_problem`, saying why.
- `akm-packages/`: the tarballs of a checkout of akm, when `--akm` names one.
- `jobs/`: Harbor's folders, one per trial, with the agent's output, opencode's log and the verifier's output. `job.json` is the Harbor job that ran and `harbor.log` is what Harbor printed.

## What it needs

- [Docker](https://docs.docker.com/engine/install/), [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh). uv runs [Harbor](https://github.com/harbor-framework/harbor) at the release the eval pins, without installing it.
- A model with tool calling. `--model NAME`, or `MODEL_NAME` in `.env`, names it as opencode does, such as `openai/gpt-6-luna`; a name without a provider is an openai model. It is resolved as in the other evals. A name that is a line of `models.json` goes to that line's URL with the key in its `api_key_env`. Any other name goes to the gateway in `MODEL_BASE_URL` with `MODEL_API_KEY` (`OPENAI_BASE_URL` and `OPENAI_API_KEY` still work as the older names of the two, and `MODEL_*` wins when both are set). Either way opencode gets them as `OPENAI_BASE_URL` and `OPENAI_API_KEY`, so an endpoint serves an openai model only, and a base URL given with a model of another provider (`anthropic/...`) stops the run with a message. With no gateway and no line, an openai model goes to OpenAI with `OPENAI_API_KEY` (or `MODEL_API_KEY`), and the model of another provider is left to Harbor, which reads that provider's key under its own name, such as `ANTHROPIC_API_KEY`. A container must be able to reach the endpoint, so not `localhost`. `JUDGE_*` is not used.
- Harbor is started with the model's variables and what it, uv and Docker read: `PATH`, `HOME`, `DOCKER_*`, `COMPOSE_*`, `UV_*`, `XDG_*`, the proxy and certificate settings, locale and terminal. It does not get the judge's key, the keys of other providers (the model's provider's own aside), or `AKM_BIN`.
- opencode's openai provider calls the Responses API (`/v1/responses`), not chat completions. The endpoint has to serve it.
- Internet from the containers: apt, GitHub, nodejs.org, the npm registry, models.dev and the model. The first build of a task image also needs Docker Hub and PyPI.
- npm on this machine, only to pack a checkout of akm (`--akm FOLDER`).

Each trial runs in its own container, built from the task's image. Harbor removes the container and the image when the trial ends. The akm arm installs Node, opencode, akm-cli (about 750 MB installed, with its dependencies) and the plugin first. The control arm installs Node and opencode.

## Which akm

The akm arm runs in a container, so `--akm` here is not a command as it is in the other evals, and `AKM_BIN` is not read (it is a command on this machine). `--akm` takes one of two things:

- `akm-cli@x.y.z`, an exact release from the npm registry. Without the flag it is the pin, `akm-cli@0.9.26`. A tag or a range such as `akm-cli@latest` is refused: two runs of it are not the same akm.
- The folder of an akm checkout, such as `~/code/akm`. The run packs it on the host with `npm pack`, which runs the checkout's own `prepack` and `prepare` scripts, and stops when the tarball lacks the file its `bin` names, which is what a checkout that was not built looks like. The tarball is kept in the run's folder (`akm-packages/`), uploaded into every akm container and installed from there, in place of the registry's. Harbor 0.24.0's job config has no setting for an upload, so the akm arm does it itself in its install, with the `upload_dir` of the environment, as it does for the libraries.

A checkout that holds the plugin, a folder a few levels down whose `package.json` is named `akm-opencode`, has it packed and installed too, with the akm-cli tarball beside it so that the akm-cli the plugin depends on is the one under test when the versions agree. opencode loads the plugin from the folder it was installed in. Otherwise the pinned plugin stays, 0.9.26202610051302, which carries its own akm-cli 0.9.26: only the akm the plugin shells out to (`AKM_OPENCODE_CLI`) is the one under test. The run says so when it starts, and `akm_install.plugin_from` is `release`. The same holds for an npm release other than the pin.

The setup used to stop unless `akm --version` was the pin. It now records what it found and stops only for an akm that prints no version: `akm --version` as printed, the akm-cli the plugin carries and the number of assets the index holds go to the trial's context and to `agent/akm_install.json`, and `summary.json` collects them in `akm_install.observed`.

`--akm-env KEY=VALUE`, repeatable, adds an AKM_* setting to every command the akm arm runs, over the arm's own (see "The two arms"): `--akm-env AKM_CURATE_TIMEOUT=30 --akm-env AKM_CURATE_LIMIT=3`. It is how a config or a strategy is swept. The five directories and `AKM_OPENCODE_CLI` are fixed by the arm and cannot be set; a name that is not `AKM_*`, or that looks like a credential, is refused, because the job and the summary record every setting.

`summary.json` says which akm ran, as the other evals do. `akm_version` is the version of the akm installed: the spec's, or the checkout's `package.json`. `akm_bin` is the `--akm` value with your home folder written as `~`, or `akm-cli@0.9.26` without the flag. `akm_build` is `git describe --always --dirty` of the checkout, null for a release. A PR branch and the release it branched from can show the same `akm_version`, and `akm_build` tells them apart. `akm_env` holds the `--akm-env` settings, and `akm_install` holds what was installed: `from` and `plugin_from` (`release` or `checkout`), the plugin's version, the tarballs with their SHA-256, and what the containers reported.

## Cost and time

A trial is one agent session. The last run of an earlier version of these tasks (28 tasks, another model) used 27,000 to 33,000 input tokens per trial, almost all of them cache reads, and about 400 output tokens. A full run is 54 trials, 9 tasks times 2 arms times 3 attempts: about 1.6 million input tokens and 22,000 output tokens, well under a dollar on a small hosted model. The report prints the tokens the run used, and the cost when the model reports one.

Four trials run at a time. With a model that answers at once, setting up an akm trial took about 2 minutes and a control trial about 1.4, and running one took seconds, so `--limit 3` (6 trials) took about 4 minutes. A real model adds its latency to every step. Expect about 40 minutes for a full run. `--repeat N` multiplies the trials and the time by N.

## The two arms

Both arms get the same model, the same opencode (1.18.34) and the same config: auto-update off, and the model under test for opencode's side jobs, such as titling a session, so a run calls one model. Harbor runs both with opencode's permission checks off. The akm arm differs in three things, and they are the treatment:

1. The plugin, named in opencode's config.
2. akm-cli, installed, and a bundle seeded with the library the task names (`AKM_TASK_STASH` in its `task.toml`) and indexed. There is no registry, so the agent can search that library and nothing else.
3. The AKM settings the plugin reads. Background work that has no later turn to learn for is off (automatic feedback, learning proposals, memory extraction, the index refresh when a session ends). Session-start curation and the hints are on: they are the plugin. The write gate stays at its default, `observe`: it records what it would block and blocks nothing. `--akm-env` adds to these or changes one.

Two checks keep the akm arm honest. At the end of setup, a warm-up session boots opencode with the real config and no model key, so the plugin is fetched before the measured run and not in it, and the setup stops unless the plugin logged that it loaded and logged no failure. After the run, the measured session's log is checked the same way. A trial where the plugin was not shown to be live is an error with no reward, not a score: it would read as "the model chose not to call akm" and make the akm arm a second control. The plugin logs a failed hook or helper and carries on, so the exit status cannot tell the two apart.

Harbor keeps only the first exception of a trial. When the agent ran out of time first, the error raised for a dead plugin is lost, and the trial would read as a timeout. So the akm arm also writes its verdict to `agent/akm_plugin_status.json` before it raises, and the runner reads it: a trial whose file says the plugin was not live gets the exception `AkmPluginNotLoadedError` and no reward, whatever else it hit first, and it still counts as a timeout if it was one.

`lib/harbor/akm_opencode.py` is the akm arm: Harbor's own opencode agent plus the above, in about 300 lines. It is shared with `benchmarks/terminal-bench`, and so are the pins, the job and the report (`lib/harbor/`). The command to run the agent's tests is at the top of `lib/harbor/test_akm_opencode.py`.

## Read the results

A trial is scored when the verifier gave it a reward, 1 or 0. A trial without one is errored: it never got far enough, or the plugin was not shown to be live. Errored trials are left out of the rates and counted, with their exception types, so read that count before the rates. A trial whose agent ran out of time, or whose setup did (Harbor's `AgentTimeoutError` and `AgentSetupTimeoutError`), is counted as a timeout, apart from the errors: `timeouts` in `summary.json` by arm, and `timed_out: true` on its row. A slower akm shows as more of them in the akm arm, and its slower install as setup timeouts. A trial whose agent ran out of time is still verified, so it keeps its reward. One whose setup did has none, and is an errored trial as well.

| Figure | Meaning |
|---|---|
| pass rate | The mean over tasks of each task's share of passed attempts, with a 95% interval: the 2.5th and 97.5th percentile of the mean over 10,000 resamples of the tasks (seed 1337). Every task weighs the same. The interval is over tasks: it says how far the rate would move with other tasks like these, not with a rerun of the same ones. |
| difference | akm minus control, task by task, averaged, with its interval from the same resampling. Only tasks that both arms have a scored trial for count, and their number is printed. |
| akm called | The share of akm trials in which the agent called at least one of the plugin's tools (`akm_search`, `akm_show`, `akm_curate`, `akm_feedback`, `akm_remember`) or ran the `akm` command in its shell, counted from opencode's own output, and how often each. |
| called, not called | The akm trials split by that, each split compared with the control on the same tasks. This describes what the model chose. It is not a randomised comparison: whatever made it call akm also made the task what it is. Read the number of tasks before the size of a difference. |
| did better | The tasks both arms scored, by which arm passed more of its attempts: the akm arm, the control, or neither. |
| read the curated results | The share of akm trials in which the agent read the file the plugin writes at the start of a session, which is akm reaching it without a tool call. |
| per scored trial | The mean minutes of a scored trial, the minutes of the agent's own run in it, and the dollars the model reports. |

The control has no plugin and no akm, so it never calls akm. The report warns when it does.

Read the engagement before the difference. Where the agent never called akm, the akm arm differs from the control by the hints and the curated context alone. In the last run of an earlier version of these tasks, a 28-task slice of which these nine are the ones whose control fails (akm-cli 0.9.10, plugin 0.9.9, opencode 1.18.21 and another model), the akm arm passed 0.202 more than the control, 0.060 to 0.369. The agent called akm in 23% of its trials and the whole effect was in them: +0.857 over the 7 tasks where it called, +0.015 over the 22 where it did not. That figure belongs to that run. It says what to look for here, not what to expect.

## Assets

- `tasks/`: 9 tasks in Harbor's task format: an `instruction.md`, an `environment/` with a Dockerfile and the starting workspace, a `solution/solve.sh`, and the `tests/` that grade it. The `task.toml` names the library to seed.
  - `drillbit--*` (3) and `inkwell--*` (3) use made-up tools. The command forms, flags and YAML fields exist only in the library, and the verifiers accept only the documented form, so a model that has not read the library cannot pass. These are marked `tools = "fictional"`.
  - `workflow-compliance--*` (3) use real tools (az, docker compose, opencode config). The verifier wants an exact command or file that the model did not give unaided in the earlier run.
- `libraries/`: the four akm libraries the tasks seed, one folder each, laid out as an akm bundle. When the agent runs, only the library of its task is in its container.
- `private/agent-ab/assets/`: the six fictional tasks and their two libraries, with tool names and numbers rewritten from a seed by `lib/rewrite`. They are made by `generate` and never published.

The nine tasks are those of the earlier 28-task slice whose control failed every attempt. A task the control already passes cannot measure akm, and the other 19 are tasks it passes in every attempt or in all but one. Nine tasks make a wide interval, and the three attempts of one task are not independent samples, which is why the interval is over tasks.

## The private tasks

Like the other evals, the private tasks exist so a model can be tested on tasks it cannot have trained on: a better public score than private score points at that. The six fictional tasks go through `lib/rewrite` in one run with the libraries that document them, so a tool name or a number means the same in an instruction, a verifier, a solution and a library:

- `drillbit` and `inkwell` get new names, in every file and in folder names. `akm` stays akm, because the agent calls the real one.
- Numbers and versions change and keep their order and their digits. A retention of `30d` becomes another number of days.
- A task's Dockerfile and `test.sh`, and the budgets in its `task.toml`, are copied as they are.

`generate` then checks every private task on a fresh copy of its starting workspace, with the task's own verifier (on this machine, with bash and uv: the inkwell verifiers run pytest), and keeps it only when:

1. its solution passes the verifier;
2. the workspace it starts with does not;
3. what the public solution leaves behind does not either. Otherwise nothing in the answer changed.

A task that fails a check is left out and the reason is printed. The three `workflow-compliance` tasks are left out without trying, because their tools are real. Renaming a tool the model knows changes how hard the task is, not only what it says, and the rewrite leaves `az` as it is. Private versions of them would need new made-up tools, written by hand. So the private run covers six tasks and the public run nine: compare them on the same tasks, from the per-task table, and not on the totals.

The same checks run in Harbor, in the tasks' own containers and with no model:

```
uv run --no-project --python 3.12 --with harbor==0.24.0 harbor run -p evals/agent-ab/tasks -a oracle -o evals/agent-ab/results/check -y
uv run --no-project --python 3.12 --with harbor==0.24.0 harbor run -p evals/agent-ab/tasks -a nop -o evals/agent-ab/results/check -y
```

`oracle` runs each task's solution: every task should score 1. `nop` does nothing: every task should score 0. For the private tasks use `-p private/agent-ab/assets/tasks -o private/agent-ab/results/check`.

## Pins

A run is made of akm-cli 0.9.26, the akm-opencode plugin 0.9.26202610051302 (which depends on exactly that akm-cli), opencode 1.18.34 and Harbor 0.24.0. They are set in `lib/harbor/harbor.ts`, shared with `benchmarks/terminal-bench`, and written to `summary.json` as `pins`, with the akm-cli and the plugin that were installed when `--akm` named another. The agent relies on how Harbor's opencode agent builds its config and its commands, so move Harbor only with the agent's tests and a smoke run.

## Comparing results

- This corpus is ours, so a good result here is partly a statement about how we wrote the tasks. It supports one claim: akm against itself, across versions. Never put a figure from it in a table, a chart or a sentence beside a benchmark score, with or without a footnote. `benchmarks/` is where those come from.
- Say what a figure is every time it appears: "first-party agent A/B, 9 tasks, 3 attempts, opencode 1.18.34 and this model", not "akm improves agent performance".
- Compare runs only with the same task set, model and pins, and move one of them at a time. When akm-cli, the plugin, opencode and the model all move together, no difference belongs to any one of them. To compare two builds of akm, run each with `--akm` and read `akm_build` in the two summaries.
- Nine tasks and three attempts move by a task or two from one run to the next. Run `--repeat 3` and compare the spread of `metrics.delta.value` before calling a change one.
- A task measures akm only when the control fails it. These were chosen for that on one model. With a stronger model the control may pass some of them, and those then add noise around zero. Look at the per-task table: a task the control passes in every attempt is not measuring akm.
- Report what looks bad as plainly as what looks good, errored trials included.

## Notes

- The plugin runs the akm-cli it carries unless `AKM_OPENCODE_CLI` names another. opencode installs a plugin without its install scripts, so on Node that copy has no SQLite binding: every helper command fails, and the plugin logs it and carries on. The agent links the akm-cli it installed, whose native build works, to `/usr/local/bin/akm` and points the plugin there. That is also the `akm` the agent finds in its own shell, which the plugin's hints mention.
- The arms also differ in ways that are not the treatment. The akm arm does its own start-up work in every session, so it is slower, and wall-clock time is not a quality signal. Its opencode caches are warm from the warm-up session, while the control's first session fetches opencode's own dependencies inside the measured run. Its container holds about 750 MB more.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
