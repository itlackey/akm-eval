# terminal-bench

Does akm change an agent's pass rate on Terminal-Bench tasks?

[Terminal-Bench 2.1](https://github.com/harbor-framework/terminal-bench-2-1) has 89 tasks that an agent does in a container with a terminal: build software, debug a program, set up a service, process data, train a small model. A task passes when its own tests accept what the agent left in the container. Each task runs twice here, once with [opencode](https://opencode.ai) alone and once with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), on the same model and, by default, one attempt each. The report gives each arm's pass rate, the difference between them over the tasks, whether the agent used akm at all, and what the run cost.

The tasks are about tools the model mostly knows, so akm has little to add and this is not expected to move much. The benchmark measures that. The library the akm arm searches is the public one the other evals use: skills, knowledge, commands, agents, scripts and workflows our lab's agents read, with nothing written for a task. This is a paired A/B on one model, not a leaderboard score. See "Comparing results".

## Run

```
benchmarks/terminal-bench/run --corpus public --limit 10
benchmarks/terminal-bench/run --corpus public
benchmarks/terminal-bench/run --corpus private
benchmarks/terminal-bench/run --corpus all
benchmarks/terminal-bench/run --limit 10 --attempts 3 --repeat 2
benchmarks/terminal-bench/run --akm ~/code/akm --akm-env AKM_CURATE_TIMEOUT=30
```

- `--corpus` picks the library the akm arm gets. The tasks are the same Terminal-Bench tasks in both. `public` is `corpus/library`. `private` is its private copy in `private/retrieval/assets/library`, made by `./generate-assets --only retrieval`, and the run stops with an error when it is missing. `all` runs both one after the other and prints the two results side by side, never as one number.
- `--limit N` runs the first N tasks of a fixed order. Its first ten are the tasks of Harbor's `terminal-bench-sample`, so `--limit 10` runs that sample, and the rest follow by name. Use it to check a setup. Without it all 89 tasks run.
- `--attempts N` runs each task N times per arm. The default is 1. A task's pass rate is then the share of its attempts that passed, and the difference averages over tasks, so a task the arms disagree on once counts for less than one they disagree on every time. The leaderboard asks for at least five.
- `--repeat N` runs the whole benchmark N times, into `<label>-r1` to `<label>-rN`, and writes the min, max and mean of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. With `--corpus all` each corpus is repeated on its own and the two are not printed side by side.
- `--model NAME` is the model, as opencode names it. It wins over `MODEL_NAME`. See "What it needs".
- `--akm akm-cli@x.y.z|FOLDER` is the akm of the akm arm, and `--akm-env KEY=VALUE` (repeatable) adds a setting to its environment. See "Which akm".
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

A run that does not do everything it set out to do is **aborted**: Harbor exited with an error, or some task, arm and attempt has no trial. It writes its `summary.json` with `status: "aborted"` and the reason, keeps all its files, prints what it has, and exits 1. Its numbers cover the trials that finished only, so it is not a result, and a matrix reads it as none. A trial that errored or timed out is not missing: it is counted, and a run in which all of them are there and Harbor exited 0 is `complete`.

Each run writes to `benchmarks/terminal-bench/results/<UTC date>-<label>/`, or to `private/terminal-bench/results/` for the private corpus:

- `summary.json`: the report described below, the model, the pins, the dataset and its digest, the library, how many tasks and attempts ran and the git commit. It also holds:
  - `akm_version`, `akm_bin`, `akm_build`, `akm_env` and `akm_install`: which akm the akm arm ran, and what was installed. See "Which akm".
  - `status` and `aborted_reason`: `complete`, or `aborted` with the reason as a sentence (`Harbor exited 1; 1 of 4 expected trials have no result (control 0, akm 1)`). `complete` needs `harbor_exit` 0 and no `missing` cell; `aborted_reason` is null then.
  - `completion`: the grid the job asked for, `expected` = the selected tasks x 2 arms x the attempts, and what became of its cells: `completed` (the trial got a reward and raised no exception), `failed` (it raised an exception or got no reward; an agent that ran out of time and was verified anyway is one, and so are the two Debian 11 tasks) and `missing` (no trial: Harbor never started the cell or was stopped before it wrote a result). So `expected` = `completed` + `failed` + `missing`. It is given for the run and, as `control` and `akm`, for each arm, and each has `unexpected`, the trials outside the grid (of a task that was not asked for, or past the attempts), which fill no cell and abort the run. `harbor_exit` is Harbor's own exit code.
  - `assets_sha256`: one digest over the cases the run scored: the digest of the library (`library.sha256`), the pinned dataset (`dataset.ref`) with the lock's digest of each selected task, and the number of attempts. Two summaries with another `assets_sha256` ran other cases and are not comparable; it moves with the library (and so with the corpus), with the tasks selected (`--limit`), with the pinned dataset and with `--attempts`. The model, the akm and the settings are other things and are not in it.
  - `engine` and `config`: the settings the shared comparison reads. `engine` is `model` and `endpoint`, the identity of the endpoint the model was sent to: scheme, host, port and path (null for the provider's own; never a key or a user), and `config` is the Harbor job as `job` has it, with every `apiKey`, `api_key`, `token` and `secret` redacted, as in the other evals' `config`.
  - `library`: the folder, `assets` (how many assets akm indexed in it, counted on the host at the start of the run), `measured_with` (the akm that counted) and `sha256` (a digest of the copy the akm arm was given). See "The library".
  - `job`: the Harbor job that ran, from `job.json`: the datasets (the dataset and the tasks), the attempts, the concurrency (4), the setup time (2,700 seconds) and the options of both agents, opencode's config among them. Paths are relative to the run's folder or the repository.
  - `timeouts` (`control` and `akm`), `n_errored` (the errored trials of both arms) and `metrics`: the report's main numbers as plain numbers, per arm (`pass_rate`, `passed`, `scored`, `errored`, `timeouts`, minutes and dollars per scored trial), the `delta` (akm minus control, with its interval and the number of tasks), `better` and `engagement` (`rate`, `called`, `curated_read`, `control_calls`). `--repeat` takes the spread of `metrics`.
  - `report`: the whole report, with the figures of the table below. Its `delta` also has `ci` and `resampled` (`tasks`, or `tasks and attempts`: what the bootstrap drew). `report.sign_test` is the sign test, `report.flips` the attempts that disagreed, and each task of `report.tasks` has `disagree` and `flips`.
- `samples.jsonl`: one line per trial, with its task, arm, reward, exception if any, whether it ran out of time (`timed_out`), the akm tools it called, whether it read the curated results, its tokens, its cost and its time. A trial whose plugin was not live has `plugin_problem`, saying why.
- `libraries/library/`: the copy of the library the akm arm was given.
- `akm-packages/`: the tarballs of a checkout of akm, when `--akm` names one.
- `jobs/`: Harbor's folders, one per trial, with the agent's output, opencode's log and the verifier's output. `job.json` is the Harbor job that ran and `harbor.log` is what Harbor printed.

`jobs/` quotes the tasks: the instruction and what the verifier prints are in it. Keep it out of git and out of anything you publish. Publish scores only. See "The data".

## What it needs

- [Docker](https://docs.docker.com/engine/install/), [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh). uv runs [Harbor](https://github.com/harbor-framework/harbor) at the release the benchmark pins, without installing it. opencode and akm are installed in each task's container.
- A model with tool calling that answers quickly, set as for `evals/agent-ab` (see "What it needs" there): `--model NAME` or `MODEL_NAME` is the model as opencode names it, such as `openai/gpt-6-luna`. A name that is a line of `models.json` goes to that line's endpoint and key, any other to the gateway in `MODEL_BASE_URL` with `MODEL_API_KEY`, and opencode gets them as `OPENAI_BASE_URL` and `OPENAI_API_KEY`. A base URL given with a model of another provider stops the run. A model server that wants no key still needs one here: the run stops before the first container when `MODEL_API_KEY` is empty, since a server that does want a key would fail every trial after its setup. Give any non-empty value, which the server ignores, and an address a container can reach: the machine's address on your network, not `localhost` or `127.0.0.1`, which a container reads as itself, and a server that listens on that address and not only on loopback. For a llama.cpp or Ollama server on `192.168.1.20`: `MODEL_NAME=my-local-model`, `MODEL_BASE_URL=http://192.168.1.20:8080/v1` and `MODEL_API_KEY=unused` in `.env`. `summary.json` records the host in `engine.endpoint` and never the key. Harbor is started with the model's variables and what it, uv and Docker need, not with the judge's key or the rest of your environment. opencode's openai provider calls the Responses API. `JUDGE_*` is not used. The tasks keep their own time limits, 15 minutes for most, and a trial that runs out of time is a lost task and not a measurement: an earlier pilot on a slow free model timed out in 43 of its 60 trials.
- Internet from the containers: apt, GitHub, nodejs.org, the npm registry, models.dev and the model. Harbor pulls each task's image from Docker Hub, which limits anonymous pulls per address (100 an hour when this was written). A full run pulls up to 89 images, so run `docker login` first when you run it more than once an hour or share the address with other pulls.
- Disk for the images: the 89 task images are 74.9 GB as Docker reports them, the biggest 6 GB. Harbor leaves each in Docker when its trials end, so a full run leaves about 65 GB behind unless you remove the images as the tasks finish. After a run, `docker images --format '{{.Repository}}:{{.Tag}}' | grep '^alexgshaw/' | xargs -r docker image rm` removes them, and any you pulled before. A trial in `results/` is 28 MB on average, because opencode's own database holds the tool outputs, and a few are 300 to 650 MB: a full run is about 5 GB.
- akm on this machine (`AKM_BIN`, else `akm` on `PATH`) to count the library's assets before the run. Without one the run goes on and the setup checks less: see "The library". npm, only to pack a checkout of akm (`--akm FOLDER`).
- CPU and memory for four containers at a time. Most tasks ask for 1 CPU and 2 GB, and up to 4 CPUs and 8 GB.
- Time: see "Cost and time".

## The data

The tasks are not in this repository. Harbor fetches them when the benchmark runs, from the dataset `terminal-bench/terminal-bench-2-1`, at the digest pinned in `assets/ASSETS.lock`, so every run is on the same 89 tasks whatever the maintainers publish next. The lock also names the tasks, each with its digest, and the ten of Harbor's sample. Each trial records the digest of the task it ran, and `summary.json` lists any task whose digest is not the lock's.

Terminal-Bench is Apache-2.0, and its maintainers ask that the tasks never appear in training data: every task file carries a canary string that says so. Keep it that way. Never commit or publish a task, a solution or a trial folder, and do not paste task text into a prompt, an issue or a library. A test fails when a file of this folder holds a task file or the canary. `NOTICE` has the attribution.

Tasks come with their own tests, solutions and time limits for the agent: 48 of the 89 allow 15 minutes, 17 allow 30 minutes, 13 allow an hour, one allows two hours, one 3 hours 20 minutes, and nine allow between 10 and 40 minutes. The run uses the limits as the task sets them, the same for both arms, and the time to set a container up is not part of them.

## The library

The akm arm searches one library, `corpus/library`. How many of its files akm indexes as assets is not written here, because it changes with every edit of the library and with akm's rules: a run counts it (below). The private corpus gives it `private/retrieval/assets/library` instead, the same library with names, tools, hosts, ids and numbers rewritten from a seed (see the root README).

A file is not an asset, and the count changes with every edit of the library and with akm's rules, so the run counts the assets itself and no number is kept in the code. Before it starts Harbor, it seeds a bundle in a sandbox as the akm arm does (the library's type folders copied in), indexes it with the akm on this machine (`AKM_BIN`, else `akm` on `PATH`) and reads the count from `akm info`, facts left out. The number goes to the akm arm as `library_assets` in `job.json`, and to `summary.json` as `library.assets`, with the akm that counted it (`library.measured_with`) and a digest of the library (`library.sha256`). Two versions of akm can index a different number of assets from one library, so the number is held against the container's akm only when that is the version that counted it. A run installs `akm-cli@0.9.26` unless `--akm` says otherwise. When the version on your machine is the same, the setup stops, and the trial is an error, when the container's akm indexes fewer, and the message says how many. An akm that indexes more passes, and the number it indexed is in `akm_install.observed.assets_indexed`. When the versions differ (your `AKM_BIN` is newer than the pinned release, say), the run warns, `library.assets` and `library.measured_with` are still recorded, and `library_assets` in `job.json` is 1: the setup only checks that the index is not empty, and you compare `library.assets` with `akm_install.observed.assets_indexed` yourself. The same goes when no akm on this machine can count: `library.assets` is null and the run says so.

The library must stay generic. The leaderboard rules treat a hint written for a task as cheating, and a library written for these tasks would measure the library and not akm. Add nothing to it for Terminal-Bench.

The private corpus does not change the tasks, so unlike the other evals it cannot say whether the model has seen them. It says whether the akm arm's result depends on the exact text of the library: a result that holds with a library whose names and numbers are rewritten rests on what the library is about and not on text the model may have met.

## Cost and time

Measured on the run of 2026-10-06 with `openai/gpt-6-luna`, on a machine with 12 cores that was busy with other work, at a load average of 20 to 30 for much of the time. The figures are opencode's own, in dollars at the model's price.

- A run of all 89 tasks is 178 trials, four at a time. It took 7 hours 6 minutes and cost $3.97: $1.68 for the control arm and $2.29 for the akm arm. The ten-task sample, 20 trials, took 28 minutes and cost $0.16.
- `--attempts N` and `--repeat N` multiply the trials and the time by N each. The figures below are for one attempt in one run.
- A scored trial took 8.9 minutes on average in the control arm and 10.6 in the akm arm (medians 4.8 and 6.2). The agent's own run is 6.2 and 6.8 minutes of that, from seconds to the task's limit. The rest is the container's setup, 1.6 minutes for the control and 2.8 for the akm arm, which installs akm-cli and warms the plugin up, and the verifier, 0.8 minutes on average and up to 12.
- A scored trial cost $0.019 in the control arm and $0.026 in the akm arm: 0.85 million and 1.45 million input tokens, nearly all of them cache reads, and about 4,000 and 4,700 output tokens. The akm arm sends 70% more input: the curated results and the hints ride in every request, and its sessions make 19% more tool calls (39.4 against 33.0).
- An agent that does not finish runs to the task's limit. 11 of the 178 trials did, 6%, and each held one of the four places for up to an hour, so a handful of tasks decide how long a run takes. Both arms ran `install-windows-3.11` to its limit of an hour.
- `--limit 10` is the cheap check: 20 trials, of which the four on the Debian 11 tasks fail in the setup within two minutes. A full run is about 7 hours on a busy machine. The time, and not the dollars, is what it costs.

## The two arms

Both arms get the same model, the same opencode (1.18.34), the same task, the same container and the same time limits, and the same config: auto-update off, and the model under test for opencode's side jobs, so a run calls one model. Harbor runs both with opencode's permission checks off. The control is Harbor's own opencode agent. The akm arm adds three things, and they are the treatment:

1. The plugin, named in opencode's config.
2. akm-cli, installed, and a bundle seeded with the library and indexed. There is no registry, so the agent can search that library and nothing else.
3. The AKM settings the plugin reads. Background work that has no later turn to learn for is off (automatic feedback, learning proposals, memory extraction, the index refresh when a session ends). Session-start curation and the hints are on: they are the plugin. The write gate stays at its default, `observe`.

At the start of a session the plugin runs akm's curate on the task's text against the library, writes the five best matches to a file, and tells the agent to read it, and it adds the akm tools and hints on using them to the agent's prompt. So the agent has two ways in: reading that file, and calling `akm_search`, `akm_show`, `akm_curate`, `akm_feedback` or `akm_remember`, or `akm` in its shell. The report counts both.

The akm arm's setup is checked, as in `evals/agent-ab`: a warm-up session must show the plugin loaded, and after the run the measured session's log must show it too. A trial where the plugin was not shown to be live is an error with no reward, not a score. Harbor keeps only the first exception of a trial, so when the agent ran out of time first, the arm's verdict is also written to `agent/akm_plugin_status.json` and the runner gives such a trial the exception `AkmPluginNotLoadedError`. `lib/harbor/akm_opencode.py` is the arm, and `lib/harbor/harbor.ts` the job, both shared with `evals/agent-ab`.

## Which akm

`--akm` and `--akm-env` work as in `evals/agent-ab` (see "Which akm" there). The akm arm runs in a container, so `--akm` is not a command: it is an exact npm release, `akm-cli@x.y.z` (the pin, `akm-cli@0.9.26`, without the flag), or the folder of an akm checkout, which is packed with `npm pack` on the host, kept in the run's folder as `akm-packages/` and installed from the tarball in each akm container. A checkout that holds the plugin has it packed too. Otherwise the pinned plugin stays and carries its own akm-cli, so only the akm it shells out to is the one under test, and the run says so. `AKM_BIN` is not read. `--akm-env AKM_CURATE_TIMEOUT=30` adds a setting to every command of the akm arm, for a sweep.

The setup records what it installed instead of requiring a version: `akm --version` as printed, the akm-cli the plugin carries and the assets the index holds, in the trial's context and in `summary.json` under `akm_install.observed`. `summary.json` has `akm_version`, `akm_bin`, `akm_build` and `akm_env` as the other evals do. A checkout's `akm_build` is `git describe --always --dirty`, and null for a release.

## Read the results

A trial is scored when the verifier gave it a reward, 1 or 0. A trial without one is errored: it never got far enough, or the plugin was not shown to be live. A trial whose agent ran out of the task's time, or whose setup ran out of its own (Harbor's `AgentTimeoutError` and `AgentSetupTimeoutError`), is a timeout: `timeouts` in `summary.json` by arm, and `timed_out: true` on its row. A slower akm shows as more of them in the akm arm. Harbor still runs the verifier on what an agent left when it ran out of time, so such a trial is usually scored too, and it is counted as a timeout as well. A setup that ran out of time has no reward, and is an errored trial too. Errored trials are left out of the rates and counted, with their exception types. A trial whose plugin was not live is one of them even when the agent ran out of time first: see "The two arms". Read the errors and the timeouts before the rates. Read `status` before all of them: an `aborted` run did not do what it set out to do, and the rates describe the trials that finished and not the ones it was meant to have. `completion` then says how many cells `failed` (an exception or no reward, the errors above) and how many are `missing` (no trial at all).

| Figure | Meaning |
|---|---|
| pass rate | The mean over tasks of each task's reward, with a 95% interval: the 2.5th and 97.5th percentile of the mean over 10,000 resamples of the tasks (seed 1337). With one attempt per task it is the share of scored tasks passed. The interval is over tasks: it says how far the rate would move with other tasks like these, not with a rerun of the same ones. |
| difference | akm minus control, task by task, averaged. Its interval is a paired bootstrap, 10,000 resamples (seed 1337), that draw tasks with replacement and, when a task has more than one scored attempt in an arm, also draw that arm's attempts inside each drawn task. So it includes the variance of a rerun of the same tasks. It counts the attempts' noise twice, so it errs wide. With one attempt per arm it is the bootstrap over tasks alone. Only tasks both arms have a scored trial for count, and their number is printed. With one attempt each task counts +1, 0 or -1. |
| sign test | An exact two-sided sign test on the tasks where the two arms' pass rates differ, printed with how many went each way. Tasks they did the same on are left out; p = 1 means no evidence either way. In `summary.json`: `report.sign_test` (`akm`, `control`, `n`, `p`). |
| did better | Those tasks by which arm passed: the akm arm only, the control only, or the same. This is the difference without the averaging, and the one to look at when the two arms disagree on few tasks. |
| akm called | The share of akm trials in which the agent called at least one of the plugin's tools or ran the `akm` command in its shell, counted from opencode's own output, and how often each. The command is matched where a command starts (also behind sudo, xargs and env, by its path, inside `$(...)` or backticks, and in `bash -c`), each tool call is counted once by its `callID`, and `which akm` or `akm` as an argument does not count. |
| read the curated results | The share of akm trials in which the agent read the file the plugin wrote at the start of the session. This is akm reaching the agent without a tool call, and on tasks like these it is the usual way. |
| called, not called | The akm trials split by `akm called`, each split compared with the control on the same tasks. It describes what the model chose. It is not a randomised comparison: whatever made it call akm also made the task what it is. |
| attempts that disagreed | With `--attempts` above 1, per arm, the tasks whose scored attempts did not all agree, out of the tasks with more than one. This is the benchmark's own noise floor. The task table's `flips c/a` column is, per task, the attempts that went against the majority outcome, in the control and in the akm arm. With one attempt there is nothing to compare. In `summary.json`: `report.flips`, and `report.tasks[].flips` and `.disagree`. |
| timed out | Trials whose agent ran out of time, in the report next to the errors and not among them. T in the task table marks the tasks. |
| per scored trial | The mean minutes of a scored trial, the minutes of the agent's own run in it, and the dollars the model reports. Most of a trial is setup, and the akm arm's is longer. Errored trials are left out: they stopped in the setup. |

The control has no plugin and no akm, so it never calls akm. The report warns when it does.

The run of 2026-10-06, with `openai/gpt-6-luna`, opencode 1.18.34, akm-cli 0.9.26, the plugin 0.9.26202610051302, Harbor 0.24.0 and the public library, as an example of a read:

- **Errors and timeouts first.** 5 of the 178 trials errored: both arms on `qemu-alpine-ssh` and `qemu-startup` (see "Notes"), and one akm trial, `sanitize-git-repo`, whose session-start curation failed, so the plugin was not shown to be live and the trial was not scored. 11 trials timed out, 6 of the control and 5 of the akm arm, on the same five tasks in both arms and one more in the control. Harbor scored them: one, in the control, passed.
- **Pass rate.** The control passed 60 of its 87 scored tasks, 0.690 [0.586, 0.782]. The akm arm passed 61 of 86, 0.709 [0.616, 0.802].
- **Difference.** +0.012 [-0.058, 0.081] over the 86 tasks both arms scored. The akm arm passed 6 tasks the control failed and failed 5 the control passed, and the two did the same on 75. The report's sign test on the 11 tasks the arms disagree on gives p = 1.
- **Engagement.** The agent read the curated results in 86 of 86 akm trials and called an akm tool in 21 of them, 24%: `akm_curate` 20 times, `akm_show` and `akm_feedback` once each. Those 21 tasks differ from the control by -0.048 [-0.143, 0.000] and the other 65 by +0.031 [-0.062, 0.123]. What it read was mostly unrelated to the task: the plugin offered 5 assets each time, 91 different ones of the library's 259 in all, and those offered most are about Playwright testing and print layout (`workflows/playwright-full-coverage` went to 47 of the 86 trials).
- **Repeat.** The ten tasks of the sample ran twice, in the sample and in the full run. 14 of the 16 trials that were scored both times, on the same task and arm, ended the same. The 2 that did not are both arms of `chess-best-move`: the control passed it in the sample and the akm arm passed it in the full run.

That run shows no effect of akm on the pass rate. The interval of the difference holds 0 and is 7 points either way, and the tasks the arms disagree on go 6 to 5. It does show that the akm arm costs 37% more dollars and 19% more minutes per scored trial, that the model reads what the plugin curates every time, and that it calls the tools in a quarter of its trials. The library has nothing about these tasks, which is why no effect was expected. That figure belongs to that run: it says what to look for here, not what to expect.

**The private corpus, a partial run.** `run --corpus private` runs all 89 tasks. The private run of 2026-10-06 did not: it was started, with the same job and the private library, on the 73 tasks where either arm passed in the public run or the akm arm called an akm tool there, and it was stopped after 2 hours 26 minutes. It covers **26 of those 73 tasks**, the ones Harbor reached first. Four trials, `compile-compcert` and `fix-ocaml-gc` in both arms, were in flight and are left out, and 45 tasks were not started. Read it as a partial result: the headline is the public run above.

- The control passed 19 of the 26 tasks, 0.731 [0.538, 0.885], and the akm arm 22, 0.846 [0.692, 0.962]. The difference is +0.115 [-0.038, 0.269]: the akm arm did better on 4 tasks, the control on 1, and they did the same on 21. 2 trials of each arm timed out, and none errored.
- The agent read the curated results in 25 of the 26 akm trials and called an akm tool in 6, 23%: `akm_curate` 7 times. The assets were the private library's, with its renamed tools, such as `fuzezeziga-full-coverage`.
- A scored trial took 9.7 minutes in the control arm and 11.5 in the akm arm, and cost $0.018 and $0.022. The 52 trials cost $1.03.
- **Repeat.** On the 26 tasks, the control arm, which uses no library, changed its outcome between the public run and this one on 6: one failed and then passed, five passed and then failed. The akm arm changed on 1. In the public run the difference on the same 26 tasks was -0.077, with the akm arm passing 21 and the control 23. So the +0.115 here comes from the control passing 4 fewer tasks than the first time, and a repeat of one arm moves the result as far as the akm arm did.

That is no more than the public run showed. It finds no effect of akm, and no dependence of the akm arm on the library's text: on 25 of the 26 tasks the akm arm did the same with the private library as with the public one.

## Comparing results

- A pass rate here is not a Terminal-Bench score. The leaderboard takes at least five trials per task, uploaded publicly to Harbor Hub. This runs one attempt per task by default, with opencode and a plugin, on a library of ours, on a machine that may be busy with other work. Never put a figure from this benchmark in a table, a chart or a sentence beside a leaderboard row, with or without a footnote. It answers one question: akm against itself on the same tasks.
- Say what a figure is every time it appears: "Terminal-Bench 2.1, 89 tasks, one attempt, opencode 1.18.34 and this model, with and without akm", not "akm improves agent performance".
- Compare only `complete` runs, and only when `assets_sha256` is the same: another digest means another library, other tasks or other attempts. A run that is `aborted` is not a result.
- Compare runs only with the same dataset digest, model, pins and library, and move one of them at a time. When akm-cli, the plugin, opencode and the model all move together, no difference belongs to any one of them.
- One attempt per task is noisy. A model that passes a task one run may fail it the next, and the paired difference is the sum of a few tasks the two arms disagreed on. In the runs above the control arm alone changed its outcome on 6 of 26 tasks between two runs. Look at `did better`, the sign test and the flips line before the interval, and repeat a run before trusting a gap of a few tasks: `--attempts N` for more attempts of each task in one run, `--repeat N` for the spread of whole runs (`metrics.delta.value` in the repeat summary).
- To compare two builds of akm, run each with `--akm` on the same dataset, model, pins and library, and read `akm_build` in the two summaries.
- A task measures akm only when the control fails it. Most of these tasks the control passes. They add nothing but noise around zero, and the pass rate of a strong model is mostly the tasks it would have passed anyway.
- Report what looks bad as plainly as what looks good, errored trials and timeouts included.

## Notes

- Two tasks, `qemu-alpine-ssh` and `qemu-startup`, are built on Debian 11 (bullseye). Harbor's opencode installer asks apt for Node and its dependencies in every container, and bullseye's security archive no longer serves them: apt answers 404. Neither arm can be set up, so both arms error on both tasks in every run, until Harbor or the images change. They are two of the 89.
- The arms also differ in ways that are not the treatment. The akm arm does its own start-up work in every session, so it is slower, and wall-clock time is not a quality signal. Its curation call runs inside the task's time limit. Its opencode caches are warm from the warm-up session, while the control's first session fetches opencode's own dependencies inside the measured run. Its container holds about 750 MB more.
- A trial is not repeatable to the letter: the model, the tasks' network access and the load of the machine change from run to run.
- `bun test benchmarks/terminal-bench` runs against a fake akm and a fake Harbor, and reads neither your `AKM_BIN` nor an akm that happens to be on `PATH`. The tests that count the library with a real akm run only when asked for, with `AKM_EVAL_REAL_AKM=1`, using `AKM_BIN` (else `akm` on `PATH`), and expect akm 0.9.26: the first of them fails by saying which version it found.

## Licence

The code is MPL-2.0. The dataset is Apache-2.0, from the Terminal-Bench team, and is not part of this repository: see `../../NOTICE`.
