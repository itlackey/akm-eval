# agent-ab

Does the akm plugin change how often an agent completes tasks where retrieval is the only way in, and does the agent actually call akm?

An agent can use only what it was trained on and what it is shown. These tasks are about tools that do not exist: their command forms, flags and file formats are written in a small akm library and nowhere else, so retrieval is the only way in. Each task runs twice, with [opencode](https://opencode.ai) alone and with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), on the same model. A task passes when its verifier accepts what the agent left in the working folder. The eval reports each arm's pass rate, the difference between them, and whether the agent called an akm tool at all: a plugin that is offered and never used cannot be what changed a result.

This task set is ours. It answers one question, akm against itself, and gives no figure to put next to a published benchmark. See "Comparing results".

## Run

```
evals/agent-ab/run --corpus public
evals/agent-ab/run --corpus custom
evals/agent-ab/run --cases ~/tasks/agent-ab
evals/agent-ab/run --corpus all
evals/agent-ab/run --repeat 3
evals/agent-ab/run --akm ~/code/akm --akm-env AKM_CURATE_TIMEOUT=30
```

- `--corpus` picks the tasks: `public` (the default) or `custom`, and `all` runs both and prints the two results side by side, never as one number. `custom` is the six tasks with made-up tools, rewritten from a seed (`private/agent-ab/assets/`, see "The private tasks"), or the folder `--cases DIR` names. A folder of your own holds `tasks/` and `libraries/`, laid out as the public ones are, and a `corpus.json` (see "Corpora" in the root README). A custom corpus flagged private is run only on a model that `models.json` marks `"private": true`. `--corpus private`, the old name of the rewritten tasks, works for one more release and says so.
- `--limit N` runs N tasks, spread over the task families, once per arm. Use it to check a setup. Without it every task runs three times per arm.
- `--model NAME` is the model, as opencode names it. It wins over `MODEL_NAME`. See "What it needs".
- `--repeat N` runs the whole eval N times, into `<label>-r1` to `<label>-rN`, and writes the min, max and mean of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. Six tasks are few: a run differs from the next by a task or two, and a change smaller than that spread is not a change. With `--corpus all` each corpus is repeated on its own and the two are not printed side by side.
- `--akm akm-cli@x.y.z|FOLDER` is the akm of the akm arm, and `--akm-env KEY=VALUE` (repeatable) adds a setting to its environment. See "Which akm".
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The custom run reads `private/agent-ab/assets/`. Make it first with `./generate-assets --only agent-ab`. The run stops with an error, before it asks about Docker, when the folder is missing or when `generated.json` in it does not match: no such file, a file made from public tasks or libraries that have changed since, a file made by a generator that has changed since, or files that are not what `generate` wrote. See "The private tasks".

A run that does not do everything it set out to do is **aborted**: Harbor exited with an error, or some task, arm and attempt has no trial. It writes its `summary.json` with `status: "aborted"` and the reason, keeps all its files, prints what it has, and exits 1. Its numbers cover the trials that finished only, so it is not a result, and a matrix reads it as none. A trial that errored or timed out is not missing: it is counted, and a run in which all of them are there and Harbor exited 0 is `complete`.

Each run writes to `evals/agent-ab/results/<UTC date>-<label>/`, or to `private/agent-ab/results/` for a custom corpus:

- `summary.json`: the report described below, the model, the pins, how many tasks and attempts ran, the corpus and the git commit. It also holds:
  - `corpus` (`public` or `custom`), `corpus_kind` (`rewrite`, `own` or `public`), `corpus_private`, `corpus_folder` (the folder of a custom corpus from the repository root, which `scripts/rescore` reads the tasks from; null for the public corpus and for a folder outside the repository, whose path is not written down) and `seed` (for a rewritten corpus).
  - `manifest`: what the run was made of, for `scripts/compare` and `scripts/rescore`: the collector and the scorer of this eval (version and digest), the digest of what each task presented to the agent (its folder and the library it seeds), the akm, the engine, the attempts, and which tasks were scored (both arms have a trial with a reward) and which were not. See "The collector, the scorer and the golden files".
  - `akm_version`, `akm_bin`, `akm_build`, `akm_env` and `akm_install`: which akm the akm arm ran, and what was installed. See "Which akm".
  - `status` and `aborted_reason`: `complete`, or `aborted` with the reason as a sentence (`Harbor exited 1; 1 of 6 expected trials have no result (control 0, akm 1)`). `complete` needs `harbor_exit` 0 and no `missing` cell; `aborted_reason` is null then.
  - `completion`: the grid the job asked for, `expected` = the selected tasks x 2 arms x the attempts, and what became of its cells: `completed` (the trial got a reward and raised no exception), `failed` (it raised an exception or got no reward; an agent that ran out of time and was verified anyway is one) and `missing` (no trial: Harbor never started the cell or was stopped before it wrote a result). So `expected` = `completed` + `failed` + `missing`. It is given for the run and, as `control` and `akm`, for each arm, and each has `unexpected`, the trials outside the grid (of a task that was not asked for, or past the attempts), which fill no cell and abort the run. `harbor_exit` is Harbor's own exit code.
  - `assets_sha256`: one digest over the cases the run scored: `libraries_sha256`, the digest of each selected task's folder (`tasks_sha256`, by task) and the number of attempts. Both are digests of the run's own copy of the tasks and the libraries (`tasks/` and `libraries/` in the run's folder), made before Harbor starts and read by Harbor, so an edit to the live folders while the run goes changes neither what the trials were given nor the digests. Two summaries with another `assets_sha256` ran other cases and are not comparable; it moves with the library, with the tasks selected (`--limit`, the corpus), with an edit of one of them, and with the attempts. The model, the akm and the settings are other things and are not in it.
  - `engine` and `config`: the settings the shared comparison reads. `engine` is `model`, `endpoint`, the host the model was sent to (scheme, host and port, null for the provider's own), and `endpoint_id`, a sha256 of the endpoint's identity (its scheme, host, port, path and query with the credentials removed), which is what a comparison compares. The path is never written down, since it can name a deployment or carry a key; two deployments on one host have two `endpoint_id`s. `config` is the Harbor job as `job` has it, with every `apiKey`, `api_key`, `token` and `secret` redacted, as in the other evals' `config`.
  - `job`: the Harbor job that ran, from `job.json`: the tasks (`datasets`), the attempts, the concurrency (4), the setup time (2,700 seconds) and the options of both agents, opencode's config among them. Paths are relative to the run's folder or the repository: the tasks and the libraries are the run's own copy (`tasks` and `libraries`). `libraries_sha256` is a digest of the libraries folder.
  - `timeouts` (`control` and `akm`), `n_errored` (the errored trials of both arms) and `metrics`: the report's main numbers as plain numbers, per arm (`pass_rate`, `passed`, `scored`, `errored`, `timeouts`, minutes and dollars per scored trial), the `delta` (akm minus control, with its interval and the number of tasks), `better` and `engagement` (`rate`, `called`, `curated_read`, `control_calls`). `--repeat` takes the spread of `metrics`.
  - `report`: the whole report, with the figures of the table below. Its `delta` also has `ci` and `resampled` (`tasks`, or `tasks and attempts`: what the bootstrap drew). `report.sign_test` is the sign test, `report.flips` the attempts that disagreed, and each task of `report.tasks` has `disagree` and `flips`.
- `samples.jsonl`: one line per task, with all its trials, the control's and the akm arm's, every attempt. A trial has its task, arm, reward, exception if any, whether it ran out of time (`timed_out`), the akm tools it called, its tokens and its time. A trial whose plugin was not live has `plugin_problem`, saying why. These are the raw output of the task, and the line adds what the scorer made of them: for each arm the trials, the ones that got a reward (`scored`), the passes, the errors and the time-outs, and whether the task is `paired` (both arms have a scored trial, so it counts in the difference). `scripts/rescore` scores a run again from the trials.
- `tasks/` and `libraries/`: the run's copy of the tasks it selected and of the libraries, made before Harbor starts. Harbor reads them, and the summary digests them.
- `akm-packages/`: the tarballs of a checkout of akm, when `--akm` names one.
- `jobs/`: Harbor's folders, one per trial, with the agent's output, opencode's log and the verifier's output. `job.json` is the Harbor job that ran and `harbor.log` is what Harbor printed.

## The collector, the scorer and the golden files

The eval is on the run manifest (see "How results stay comparable" in the root README). Its files are split by what a change to them does:

- `src/collect.ts` is the **collector**: the copy of the tasks and the libraries a run gives Harbor, the Harbor job, and the reading of what Harbor left. In `lib/harbor`, `harbor.ts` (the job, the pins, the akm arm's install, the model), `trials.ts` (what a trial's folder is read into, the agent's akm calls included), `akm_opencode.py` (the akm arm) and the lockfiles under `locks/` are listed with it, and the files they import (`lib/akm/akm.ts`, `lib/cli.ts`, `lib/models.ts`, `lib/provenance.ts`). A change to any of them changes what the agent is given or what is kept of its run: bump the collector (`scripts/measurement/run bump agent-ab collector --reason "..."`), and earlier runs are no longer comparable with later ones.
- `lib/harbor/score.ts` and `lib/harbor/report.ts` are the **scorer**, shared with `benchmarks/terminal-bench`: the row of a task, the paired comparison of the two arms, the report and the metrics. A change to them changes what the eval scores: bump the scorer, and update the golden files in the same change. No run is invalidated: `scripts/rescore` scores any stored run again.
- `src/measurement.ts` declares both lists, what each task presents to the agent (the digest of its folder and of the library it seeds), and how a stored line is read back into its raw output. The verifier runs inside the trial and its reward is raw output, so the scorer reads nothing of a task and the labels are empty.
- `golden/` holds six tasks with the trials Harbor left for them (an attempt that ran out of time and was verified, a trial the plugin was not live in, a control whose setup ran out of time in every attempt, one that left no log, a task Harbor never started), and the row the scorer must give for each, and the report and metrics of all of them, first written from the code before the scorer was split from the collector. `src/golden.test.ts` fails when a scorer change alters one. `UPDATE_GOLDEN=1 bun test evals/agent-ab/src/golden.test.ts` writes the expected rows again, and the files say which scorer version they are for.

```
scripts/rescore/run evals/agent-ab/results/<UTC date>-<label>      # writes <UTC date>-<label>-rescored beside it
scripts/rescore/run --cases ~/tasks/agent-ab private/agent-ab/results/<UTC date>-<label>      # a custom corpus outside the repository
```

A run on a custom corpus is rescored against the tasks in its `corpus_folder`. A corpus outside the repository records none, and `--cases DIR` gives rescore its folder.

A run from before the manifest has one line per trial and no manifest, and is not rescored.

## What it needs

- [Docker](https://docs.docker.com/engine/install/), [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh). uv runs [Harbor](https://github.com/harbor-framework/harbor) at the release the eval pins, without installing it.
- A model with tool calling. `--model NAME`, or `MODEL_NAME` in `.env`, names it as opencode does, such as `openai/gpt-6-luna`; a name without a provider is an openai model. It is resolved as in the other evals. A name that is a line of `models.json` goes to that line's URL with the key in its `api_key_env`. Any other name goes to the gateway in `MODEL_BASE_URL` with `MODEL_API_KEY` (`OPENAI_BASE_URL` and `OPENAI_API_KEY` still work as the older names of the two, each for its own `MODEL_*` one, and `MODEL_*` wins when both are set. `OPENAI_API_KEY` stands in for an empty `MODEL_API_KEY` only for the URL it goes with, `OPENAI_BASE_URL`, or for `api.openai.com`: it is OpenAI's key, and a gateway of another host is not sent it, so the run stops for want of a key). Either way opencode gets them as `OPENAI_BASE_URL` and `OPENAI_API_KEY`, as the openai provider, so it is given `openai/<id>`, with the id as the endpoint names it: a slash in it is part of the id (`Qwen/Qwen2.5-7B` becomes `openai/Qwen/Qwen2.5-7B`), and an id that already starts with `openai/` is kept. `--model openai/my-cloud-model` finds the `models.json` line `my-cloud-model`, as `--model my-cloud-model` does. With no gateway and no line, an openai model goes to OpenAI with `OPENAI_API_KEY` (or `MODEL_API_KEY`), and the model of another provider is left to Harbor, which reads that provider's key under its own name, such as `ANTHROPIC_API_KEY`. A container must be able to reach the endpoint, so not `localhost`. `JUDGE_*` is not used.
- A model server that wants no key still needs one here: the run stops before the first container when `MODEL_API_KEY` is empty, since a server that does want a key would fail every trial after its setup. Give any non-empty value, which the server ignores, and an address a container can reach: the machine's address on your network, not `localhost` or `127.0.0.1`, which a container reads as itself, and a server that listens on that address and not only on loopback. For a llama.cpp or Ollama server on `192.168.1.20`:

  ```
  MODEL_NAME=my-local-model
  MODEL_BASE_URL=http://192.168.1.20:8080/v1
  MODEL_API_KEY=unused
  ```

  The server has to serve `/v1/responses`, as below. `summary.json` records the host of the endpoint in `engine.endpoint` and a digest of its identity in `engine.endpoint_id`, never the path and never the key.
- Harbor is started with the model's variables and what it, uv and Docker read: `PATH`, `HOME`, `DOCKER_*`, `COMPOSE_*`, `UV_*`, `XDG_*`, the proxy and certificate settings, locale and terminal. It does not get the judge's key, the keys of other providers (the model's provider's own aside), or `AKM_BIN`.
- opencode's openai provider calls the Responses API (`/v1/responses`), not chat completions. The endpoint has to serve it.
- Internet from the containers: apt, GitHub, nodejs.org, the npm registry, models.dev and the model. The first build of a task image also needs Docker Hub and PyPI.
- npm on this machine, only to pack a checkout of akm (`--akm FOLDER`).

Each trial runs in its own container, built from the task's image. Harbor removes the container and the image when the trial ends. The akm arm installs Node, opencode, akm-cli (about 750 MB installed, with its dependencies) and the plugin first. The control arm installs Node and opencode.

## Which akm

The akm arm runs in a container, so `--akm` here is not a command as it is in the other evals, and `AKM_BIN` is not read (it is a command on this machine). `--akm` takes one of two things:

- `akm-cli@x.y.z`, an exact release from the npm registry. Without the flag it is the pin, `akm-cli@0.9.26`. A tag or a range such as `akm-cli@latest` is refused: two runs of it are not the same akm. Only the pin has a lockfile (see "Dependencies"); another release is installed by `npm install`.
- The folder of an akm checkout, such as `~/code/akm`. The run packs it on the host with `npm pack`, which runs the checkout's own `prepack` and `prepare` scripts, and stops when the tarball lacks the file its `bin` names, which is what a checkout that was not built looks like. The tarball is kept in the run's folder (`akm-packages/`), uploaded into every akm container and installed from there, in place of the registry's. Harbor 0.24.0's job config has no setting for an upload, so the akm arm does it itself in its install, with the `upload_dir` of the environment, as it does for the libraries.

A checkout that holds the plugin, a folder a few levels down whose `package.json` is named `akm-opencode`, has it packed and installed too, with the akm-cli tarball beside it so that the akm-cli the plugin depends on is the one under test when the versions agree. opencode loads the plugin from the folder it was installed in. Otherwise the pinned plugin stays, 0.9.26202610051302, which carries its own akm-cli 0.9.26: only the akm the plugin shells out to (`AKM_OPENCODE_CLI`) is the one under test. The run says so when it starts, and `akm_install.plugin_from` is `release`. The same holds for an npm release other than the pin.

The setup used to stop unless `akm --version` was the pin. It now records what it found and stops only for an akm that prints no version: `akm --version` as printed, the akm-cli the plugin carries and the number of assets the index holds go to the trial's context and to `agent/akm_install.json`, and `summary.json` collects them in `akm_install.observed`.

`--akm-env KEY=VALUE`, repeatable, adds an AKM_* setting to every command the akm arm runs, over the arm's own (see "The two arms"): `--akm-env AKM_CURATE_TIMEOUT=30 --akm-env AKM_CURATE_LIMIT=3`. It is how a config or a strategy is swept. The five directories and `AKM_OPENCODE_CLI` are fixed by the arm and cannot be set; a name that is not `AKM_*`, or that names a credential, is refused, because the job and the summary record every setting. A name is a credential's by the rule every eval shares (`credentialField` in `lib/provenance.ts`): it ends in key, secret, password, token, credential, authorization or cookie, or its last word is auth, bearer, pat or pass. `AKM_MAX_TOKENS` and `AKM_AUTHOR` are not.

`summary.json` says which akm ran, as the other evals do. `akm_version` is the version of the akm installed: the spec's, or the checkout's `package.json`. `akm_bin` is the `--akm` value with your home folder written as `~`, or `akm-cli@0.9.26` without the flag. `akm_build` is `git describe --always --dirty` of the checkout, null for a release. A PR branch and the release it branched from can show the same `akm_version`, and `akm_build` tells them apart. `akm_env` holds the `--akm-env` settings, and `akm_install` holds what was installed: `from` and `plugin_from` (`release` or `checkout`), the plugin's version, the tarballs with their SHA-256, the digest of the dependency tree and whether it came from lockfiles (see "Dependencies"), and what the containers reported.

### Dependencies

Neither akm-cli nor the plugin pins its own dependencies (`zod ^3.23`, `yaml ^2.8.4`, `sqlite-vec ^0.1.9`, `@opencode-ai/plugin ^1.18.14` and so on), so `npm install` would give every container the newest version each range allows on the day, and two trials, or two runs, could run different code under one version. The pinned releases are therefore installed from lockfiles committed in `lib/harbor/locks/`, with `npm ci`: `akm-cli-0.9.26/` and `akm-opencode-0.9.26202610051302/`, each a `package.json` and a `package-lock.json` made by npm against the registry. The plugin is installed the same way, under `/opt/akm/plugin`, and opencode loads it from that folder, as it does a plugin from a checkout. The plugin's lockfile pins the akm-cli the plugin carries. Its dependencies are installed without install scripts, as opencode installs a plugin's.

Each trial records, in `agent/akm_install.json`, the sha256 of the lockfile each install came from (null for an install that came from none) and the sha256 of what `npm ls --all --json` says is installed under each of the two folders, and one digest over the two (`dependency_tree_sha256`). `summary.json` collects them in `akm_install.observed` and keeps the one tree in `akm_install.dependency_tree_sha256`, with `akm_install.locked`: true when both installs came from a lockfile. The digest is also folded into `akm_build_fingerprint`, with the digest of a checkout's uncommitted changes when there are some, so two runs of one version with other dependencies have other build identities in a comparison. A run whose akm containers installed more than one tree is aborted, with the number of trees in `aborted_reason`.

A checkout (`--akm FOLDER`) and a release other than the pin have no lockfile. The run says so when it starts: npm resolves their dependencies in each container, `akm_install.locked` is false, and the digest is the only thing that tells two such runs apart. To lock a new pin, change it in `lib/harbor/harbor.ts`, make the folder `lib/harbor/locks/<package>-<version>/` with a `package.json` that depends on exactly that version, run `npm install --package-lock-only --ignore-scripts` in it, and commit both files. A test stops a pin that has no lockfile, or one that locks another version.

## Cost and time

A trial is one agent session. The last run of an earlier version of these tasks (28 tasks, another model) used 27,000 to 33,000 input tokens per trial, almost all of them cache reads, and about 400 output tokens. A full run is 36 trials, 6 tasks times 2 arms times 3 attempts: about 1.1 million input tokens and 14,000 output tokens, well under a dollar on a small hosted model. The report prints the tokens the run used, and the cost when the model reports one.

Four trials run at a time. With a model that answers at once, setting up an akm trial took about 2 minutes and a control trial about 1.4, and running one took seconds, so `--limit 3` (6 trials) took about 4 minutes. A real model adds its latency to every step. Expect about 30 minutes for a full run. `--repeat N` multiplies the trials and the time by N.

## The two arms

Both arms get the same model, the same opencode (1.18.34) and the same config: auto-update off, and the model under test for opencode's side jobs, such as titling a session, so a run calls one model. Harbor runs both with opencode's permission checks off. The akm arm differs in three things, and they are the treatment:

1. The plugin, named in opencode's config.
2. akm-cli, installed, and a bundle seeded with the library the task names (`AKM_TASK_STASH` in its `task.toml`) and indexed. There is no registry, so the agent can search that library and nothing else.
3. The AKM settings the plugin reads. Background work that has no later turn to learn for is off (automatic feedback, learning proposals, memory extraction, the index refresh when a session ends). Session-start curation and the hints are on: they are the plugin. The write gate stays at its default, `observe`: it records what it would block and blocks nothing. `--akm-env` adds to these or changes one.

Two checks keep the akm arm honest. At the end of setup, a warm-up session boots opencode with the real config and no model key, so the plugin's first load is before the measured run and not in it, and the setup stops unless the plugin logged that it loaded and logged no failure. After the run, the measured session's log is checked the same way. A trial where the plugin was not shown to be live is an error with no reward, not a score: it would read as "the model chose not to call akm" and make the akm arm a second control. The plugin logs a failed hook or helper and carries on, so the exit status cannot tell the two apart.

Harbor keeps only the first exception of a trial. When the agent ran out of time first, the error raised for a dead plugin is lost, and the trial would read as a timeout. So the akm arm also writes its verdict to `agent/akm_plugin_status.json` before it raises, and the runner reads it: a trial whose file says the plugin was not live gets the exception `AkmPluginNotLoadedError` and no reward, whatever else it hit first, and it still counts as a timeout if it was one.

`lib/harbor/akm_opencode.py` is the akm arm: Harbor's own opencode agent plus the above, in about 300 lines. It is shared with `benchmarks/terminal-bench`, and so are the pins, the job and the report (`lib/harbor/`). The command to run the agent's tests is at the top of `lib/harbor/test_akm_opencode.py`.

## Read the results

Read `status` first. An `aborted` run did not do what it set out to do, and everything below describes the trials that finished, not the ones the run was meant to have. Then `completion`: `failed` counts the trials that raised an exception or got no reward, which the rates leave out, and `missing` the cells that never produced a trial at all.

A trial is scored when the verifier gave it a reward, 1 or 0. A trial without one is errored: it never got far enough, or the plugin was not shown to be live. Errored trials are left out of the rates and counted, with their exception types, so read that count before the rates. A trial whose agent ran out of time, or whose setup did (Harbor's `AgentTimeoutError` and `AgentSetupTimeoutError`), is counted as a timeout, apart from the errors: `timeouts` in `summary.json` by arm, and `timed_out: true` on its row. A slower akm shows as more of them in the akm arm, and its slower install as setup timeouts. The count is made in one place, so `timeouts`, the `metrics`, `report.control.timeouts` and `report.akm.timeouts` and the "timed out" of the printed table agree, a trial that ran out of time and then failed the plugin check included. A trial whose agent ran out of time is still verified, so it keeps its reward. One whose setup did has none, and is an errored trial as well.

| Figure | Meaning |
|---|---|
| pass rate | The mean over tasks of each task's share of passed attempts, with a 95% interval: the 2.5th and 97.5th percentile of the mean over 10,000 resamples of the tasks (seed 1337). Every task weighs the same. The interval is over tasks: it says how far the rate would move with other tasks like these, not with a rerun of the same ones. |
| difference | akm minus control, task by task, averaged. Its interval is a paired bootstrap, 10,000 resamples (seed 1337), that draw tasks with replacement and, when a task has more than one scored attempt in an arm, also draw that arm's attempts inside each drawn task. So it includes the variance of a rerun of the same tasks. It counts the attempts' noise twice, so it errs wide. With one attempt per arm it is the bootstrap over tasks alone. Only tasks that both arms have a scored trial for count, and their number is printed. |
| sign test | An exact two-sided sign test on the tasks where the two arms' pass rates differ, printed with how many went each way. Tasks they did the same on are left out; p = 1 means no evidence either way. In `summary.json`: `report.sign_test` (`akm`, `control`, `n`, `p`). |
| attempts that disagreed | Per arm, the tasks whose scored attempts did not all agree, out of the tasks with more than one. This is the eval's own noise floor. The table's `flips c/a` column is, per task, the attempts that went against the majority outcome, in the control and in the akm arm. In `summary.json`: `report.flips`, and `report.tasks[].flips` and `.disagree`. |
| akm called | The share of akm trials in which the agent called at least one of the plugin's tools (`akm_search`, `akm_show`, `akm_curate`, `akm_feedback`, `akm_remember`) or ran the `akm` command in its shell, counted from opencode's own output, and how often each. The command is matched where a command starts (also behind sudo, xargs and env, by its path, inside `$(...)` or backticks, and in `bash -c`), each tool call is counted once by its `callID`, and `which akm` or `akm` as an argument does not count. |
| called, not called | The akm trials split by that, each split compared with the control on the same tasks. This describes what the model chose. It is not a randomised comparison: whatever made it call akm also made the task what it is. Read the number of tasks before the size of a difference. |
| did better | The tasks both arms scored, by which arm passed more of its attempts: the akm arm, the control, or neither. |
| read the curated results | The share of akm trials in which the agent read the file the plugin writes at the start of a session, which is akm reaching it without a tool call. |
| per scored trial | The mean minutes of a scored trial, the minutes of the agent's own run in it, and the dollars the model reports. |

The control has no plugin and no akm, so it never calls akm. The report warns when it does.

Read the engagement before the difference. Where the agent never called akm, the akm arm differs from the control by the hints and the curated context alone. In the last run of an earlier version of these tasks, a 28-task slice of which nine were the ones whose control fails, six of them the tasks here (akm-cli 0.9.10, plugin 0.9.9, opencode 1.18.21 and another model), the akm arm passed 0.202 more than the control, 0.060 to 0.369. The agent called akm in 23% of its trials and the whole effect was in them: +0.857 over the 7 tasks where it called, +0.015 over the 22 where it did not. That figure belongs to that run. It says what to look for here, not what to expect.

## Assets

- `tasks/`: 6 tasks in Harbor's task format: an `instruction.md`, an `environment/` with a Dockerfile and the starting workspace, a `solution/solve.sh`, and the `tests/` that grade it. The `task.toml` names the library to seed.
  - `drillbit--*` (3) and `inkwell--*` (3) use made-up tools. The command forms, flags and YAML fields exist only in the library, and the verifiers accept only the documented form, so a model that has not read the library cannot pass. These are marked `tools = "fictional"`, and every task here is: the eval measures only tasks where retrieval is the only way in.
  - Each `task.toml` lists `library_tokens`: the literals its verifier looks for, such as a subcommand, a flag, a field name or a value. `src/lib.test.ts` checks that the task's gold ref holds each of them, and that no instruction or starting file mentions akm, a skill, the library or the stash, tells the agent to consult one, or names the gold ref. So the akm arm is not told to call akm, and the library holds what the verifier asks for.
- `libraries/`: the two akm libraries the tasks seed, `drillbit` and `inkwell`, one folder each, laid out as an akm bundle. When the agent runs, only the library of its task is in its container.
- `private/agent-ab/assets/`: the six fictional tasks and their two libraries, with tool names and numbers rewritten from a seed by `lib/rewrite`, and `generated.json`. They are made by `generate` and never published.

The six tasks are among those of the earlier 28-task slice whose control failed every attempt. A task the control already passes cannot measure akm. The slice also held three tasks with real tools (az tag-list, docker compose render, opencode provider-token), and those were dropped (#48): an agent can likely pass tasks about tools it knows unaided, and then they measure nothing about akm and dilute the difference. Their libraries (`az-cli` and `noisy`) went with them, and a run from before ran nine tasks and so has another `assets_sha256`: it is not comparable with these (see "Comparing results"). That selection predates the edits that removed the akm and skill nudges and the leaked ref from the instructions and the workspace READMEs, and that made the libraries hold what the verifiers look for. The verifier or library of the inkwell add-healthcheck task changed, and the workspace READMEs of several lost the lines that pointed at akm or a skill. Whether the control still fails them is not known until a run, so the next run is a new baseline and is not comparable with earlier results. Six tasks make a wide interval, and the three attempts of one task are not independent samples, which is why the pass-rate intervals are over tasks. The interval of the difference also resamples the attempts of a task.

## The private tasks

Like the other evals, the private tasks exist so a model can be tested on tasks it cannot have trained on: a better public score than private score points at that. The six fictional tasks go through `lib/rewrite` in one run with the libraries that document them, so a tool name or a number means the same in an instruction, a verifier, a solution and a library:

- `drillbit` and `inkwell` get new names, in every file and in folder names. `akm` stays akm, because the agent calls the real one.
- Numbers and versions change and keep their order and their digits. A retention of `30d` becomes another number of days.
- A task's Dockerfile and `test.sh`, and the budgets in its `task.toml`, are copied as they are.

`generate` then checks every private task on a fresh copy of its starting workspace, with the task's own verifier (on this machine, with bash and uv: the inkwell verifiers run pytest), and keeps it only when:

1. its solution passes the verifier;
2. the workspace it starts with does not;
3. what the public solution leaves behind does not either. Otherwise nothing in the answer changed;
4. its library holds every literal its `task.toml` lists under `library_tokens`, the flags, subcommands, field names and values the verifier looks for.

A task that fails a check is left out and the reason is printed. A task with real tools would be left out without trying: renaming a tool the model knows changes how hard the task is, not only what it says. The public set has none now (see "Assets"), so the private run covers the same six tasks as the public one, and the two compare task by task.

Every file of every kept task and library is then searched for a renamed word that is still there. `generate` makes the map, the tasks, the libraries and `generated.json` together in a staging folder beside the assets, and moves them into place, the assets and `map.json` at once, only when everything is sound: at least one task kept and no renamed word left over. A check that fails, a solution that does not run, or an error part way leaves `private/agent-ab/assets/` and `map.json` exactly as the run before left them, and `generate` exits 1 and says that nothing was changed. `generated.json`, in the assets, holds `version` (1), the `seed`, `inputs_sha256` (a digest of the public fictional tasks and the libraries they seed, the files `generate` reads), `generator_sha256` (a digest of its own source: `generate.ts`, `inputs.ts` and `lib.ts` here and `lib/rewrite`, its lexicon included) and `outputs_sha256` (a digest of every file under the assets except `generated.json`). `run --corpus custom` refuses assets with no `generated.json` in that format, with an `inputs_sha256` that is not the public inputs' as they are now, with a `generator_sha256` that is not the generator's as it is now, or with an `outputs_sha256` that is not the files' as they are, and says to run `./generate-assets --only agent-ab` again. So a change to the generator, `lib/rewrite` included, makes the assets stale.

The same checks run in Harbor, in the tasks' own containers and with no model:

```
uv run --no-project --python 3.12 --with harbor==0.24.0 harbor run -p evals/agent-ab/tasks -a oracle -o evals/agent-ab/results/check -y
uv run --no-project --python 3.12 --with harbor==0.24.0 harbor run -p evals/agent-ab/tasks -a nop -o evals/agent-ab/results/check -y
```

`oracle` runs each task's solution: every task should score 1. `nop` does nothing: every task should score 0. For the private tasks use `-p private/agent-ab/assets/tasks -o private/agent-ab/results/check`. `bun test evals/agent-ab/src` also proves the six public tasks with a shell verifier (the solution passes, the empty workspace fails). The three inkwell tasks run pytest through uv, which needs the network, so they are proven by `generate` and by the Harbor runs above.

## Pins

A run is made of akm-cli 0.9.26, the akm-opencode plugin 0.9.26202610051302 (which depends on exactly that akm-cli), opencode 1.18.34 and Harbor 0.24.0. They are set in `lib/harbor/harbor.ts`, shared with `benchmarks/terminal-bench`, and written to `summary.json` as `pins`, with the akm-cli and the plugin that were installed when `--akm` named another. The agent relies on how Harbor's opencode agent builds its config and its commands, so move Harbor only with the agent's tests and a smoke run. akm-cli and the plugin are installed with the dependencies their lockfiles in `lib/harbor/locks/` pin (see "Dependencies"). Runs from before that installed whatever each caret range allowed on their day, so they are not comparable with these: the code the akm arm ran differs. This is a change to what the eval measures.

## Comparing results

- This corpus is ours, so a good result here is partly a statement about how we wrote the tasks. It supports one claim: akm against itself, across versions. Never put a figure from it in a table, a chart or a sentence beside a benchmark score, with or without a footnote. `benchmarks/` is where those come from.
- Say what a figure is every time it appears: "first-party agent A/B, 6 tasks, 3 attempts, opencode 1.18.34 and this model", not "akm improves agent performance".
- Compare only `complete` runs, and only when `assets_sha256` is the same: another digest means other tasks, another library or other attempts. A run that is `aborted` is not a result.
- Compare runs only with the same task set, model and pins, and move one of them at a time. When akm-cli, the plugin, opencode and the model all move together, no difference belongs to any one of them. To compare two builds of akm, run each with `--akm` and read `akm_build` in the two summaries.
- Six tasks and three attempts move by a task or two from one run to the next. Run `--repeat 3` and compare the spread of `metrics.delta.value` before calling a change one.
- A task measures akm only when the control fails it. These were chosen for that on one model. A task stays in the set only when its control arm fails it on two or more models: check this whenever a task is added or changed. It has not been checked since the task edits (see "Assets"), so a task may fall out of the set. With a stronger model the control may pass some of them, and those then add noise around zero. Look at the per-task table: a task the control passes in every attempt is not measuring akm.
- Report what looks bad as plainly as what looks good, errored trials included.

## Notes

- The plugin runs the akm-cli it carries unless `AKM_OPENCODE_CLI` names another. The plugin is installed without its dependencies' install scripts (as opencode installs one), so on Node that copy has no SQLite binding: every helper command fails, and the plugin logs it and carries on. The agent links the akm-cli it installed, whose native build works, to `/usr/local/bin/akm` and points the plugin there. That is also the `akm` the agent finds in its own shell, which the plugin's hints mention.
- The arms also differ in ways that are not the treatment. The akm arm does its own start-up work in every session, so it is slower, and wall-clock time is not a quality signal. Its opencode caches are warm from the warm-up session, while the control's first session fetches opencode's own dependencies inside the measured run. Its container holds about 750 MB more.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
