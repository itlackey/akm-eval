# terminal-bench

Does akm change an agent's pass rate on Terminal-Bench tasks?

[Terminal-Bench 2.1](https://github.com/harbor-framework/terminal-bench-2-1) has 89 tasks that an agent does in a container with a terminal: build software, debug a program, set up a service, process data, train a small model. A task passes when its own tests accept what the agent left in the container. Each task runs twice here, once with [opencode](https://opencode.ai) alone and once with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), on the same model and one attempt each. The report gives each arm's pass rate, the difference between them over the tasks, whether the agent used akm at all, and what the run cost.

The tasks are about tools the model mostly knows, so akm has little to add and this is not expected to move much. The benchmark measures that. The library the akm arm searches is the public one the other evals use: skills, knowledge, commands, agents, scripts and workflows our lab's agents read, with nothing written for a task. This is a paired A/B on one model, not a leaderboard score. See "Comparing results".

## Run

```
benchmarks/terminal-bench/run --corpus public --limit 10
benchmarks/terminal-bench/run --corpus public
benchmarks/terminal-bench/run --corpus private
benchmarks/terminal-bench/run --corpus all
```

- `--corpus` picks the library the akm arm gets. The tasks are the same Terminal-Bench tasks in both. `public` is `corpus/library`. `private` is its private copy in `private/retrieval/assets/library`, made by `./generate-assets --only retrieval`, and the run stops with an error when it is missing. `all` runs both one after the other and prints the two results side by side, never as one number.
- `--limit N` runs the first N tasks of a fixed order. Its first ten are the tasks of Harbor's `terminal-bench-sample`, so `--limit 10` runs that sample, and the rest follow by name. Use it to check a setup. Without it all 89 tasks run.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

Each run writes to `benchmarks/terminal-bench/results/<UTC date>-<label>/`, or to `private/terminal-bench/results/` for the private corpus:

- `summary.json`: the report described below, the model, the pins, the dataset and its digest, the library, how many tasks ran and the git commit.
- `samples.jsonl`: one line per trial, with its task, arm, reward, exception if any, the akm tools it called, whether it read the curated results, its tokens, its cost and its time.
- `libraries/library/`: the copy of the library the akm arm was given.
- `jobs/`: Harbor's folders, one per trial, with the agent's output, opencode's log and the verifier's output. `job.json` is the Harbor job that ran and `harbor.log` is what Harbor printed.

`jobs/` quotes the tasks: the instruction and what the verifier prints are in it. Keep it out of git and out of anything you publish. Publish scores only. See "The data".

## What it needs

- [Docker](https://docs.docker.com/engine/install/), [uv](https://docs.astral.sh/uv/) and [bun](https://bun.sh). uv runs [Harbor](https://github.com/harbor-framework/harbor) at the release the benchmark pins, without installing it. opencode and akm are installed in each task's container.
- A model with tool calling that answers quickly, set in `.env` as for `evals/agent-ab`: `MODEL_NAME` is the model as opencode names it, such as `openai/gpt-6-luna`, and the key goes in `MODEL_API_KEY` (or `OPENAI_API_KEY`). opencode's openai provider calls the Responses API. `JUDGE_*` is not used. The tasks keep their own time limits, 15 minutes for most, and a trial that runs out of time is a lost task and not a measurement: an earlier pilot on a slow free model timed out in 43 of its 60 trials.
- Internet from the containers: apt, GitHub, nodejs.org, the npm registry, models.dev and the model. Harbor pulls each task's image from Docker Hub, which limits anonymous pulls per address (100 an hour when this was written). A full run pulls up to 89 images, so run `docker login` first when you run it more than once an hour or share the address with other pulls.
- Disk for the images: the 89 task images are 74.9 GB as Docker reports them, the biggest 6 GB. Harbor leaves each in Docker when its trials end, so a full run leaves about 65 GB behind unless you remove the images as the tasks finish. After a run, `docker images --format '{{.Repository}}:{{.Tag}}' | grep '^alexgshaw/' | xargs -r docker image rm` removes them, and any you pulled before. A trial in `results/` is 28 MB on average, because opencode's own database holds the tool outputs, and a few are 300 to 650 MB: a full run is about 5 GB.
- CPU and memory for four containers at a time. Most tasks ask for 1 CPU and 2 GB, and up to 4 CPUs and 8 GB.
- Time: see "Cost and time".

## The data

The tasks are not in this repository. Harbor fetches them when the benchmark runs, from the dataset `terminal-bench/terminal-bench-2-1`, at the digest pinned in `assets/ASSETS.lock`, so every run is on the same 89 tasks whatever the maintainers publish next. The lock also names the tasks, each with its digest, and the ten of Harbor's sample. Each trial records the digest of the task it ran, and `summary.json` lists any task whose digest is not the lock's.

Terminal-Bench is Apache-2.0, and its maintainers ask that the tasks never appear in training data: every task file carries a canary string that says so. Keep it that way. Never commit or publish a task, a solution or a trial folder, and do not paste task text into a prompt, an issue or a library. A test fails when a file of this folder holds a task file or the canary. `NOTICE` has the attribution.

Tasks come with their own tests, solutions and time limits for the agent: 48 of the 89 allow 15 minutes, 17 allow 30 minutes, 13 allow an hour, one allows two hours, one 3 hours 20 minutes, and nine allow between 10 and 40 minutes. The run uses the limits as the task sets them, the same for both arms, and the time to set a container up is not part of them.

## The library

The akm arm searches one library, `corpus/library`: 317 files, of which akm indexes 259 as assets (35 skills, 111 knowledge notes, 58 scripts, 25 commands, 24 agents and 6 workflows). The private corpus gives it `private/retrieval/assets/library` instead, the same library with names, tools, hosts, ids and numbers rewritten from a seed (see the root README). Both index to 259 assets. The setup stops, and the trial is an error, when the container's akm indexes fewer.

The library must stay generic. The leaderboard rules treat a hint written for a task as cheating, and a library written for these tasks would measure the library and not akm. Add nothing to it for Terminal-Bench.

The private corpus does not change the tasks, so unlike the other evals it cannot say whether the model has seen them. It says whether the akm arm's result depends on the exact text of the library: a result that holds with a library whose names and numbers are rewritten rests on what the library is about and not on text the model may have met.

## Cost and time

Measured on the run of 2026-10-06 with `openai/gpt-6-luna`, on a machine with 12 cores that was busy with other work, at a load average of 20 to 30 for much of the time. The figures are opencode's own, in dollars at the model's price.

- A run of all 89 tasks is 178 trials, four at a time. It took 7 hours 6 minutes and cost $3.97: $1.68 for the control arm and $2.29 for the akm arm. The ten-task sample, 20 trials, took 28 minutes and cost $0.16.
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

The akm arm's setup is checked, as in `evals/agent-ab`: a warm-up session must show the plugin loaded, and after the run the measured session's log must show it too. A trial where the plugin was not shown to be live is an error with no reward, not a score. `lib/harbor/akm_opencode.py` is the arm, and `lib/harbor/harbor.ts` the job, both shared with `evals/agent-ab`.

## Read the results

A trial is scored when the verifier gave it a reward, 1 or 0. A trial without one is errored: it never got far enough, or the plugin was not shown to be live. A trial whose agent ran out of the task's time is a timeout. Harbor still runs the verifier on what the agent left, so a timed-out trial is usually scored too, and it is counted as a timeout as well. Errored trials are left out of the rates and counted, with their exception types. Read the errors and the timeouts before the rates.

| Figure | Meaning |
|---|---|
| pass rate | The mean over tasks of each task's reward, with a 95% interval: the 2.5th and 97.5th percentile of the mean over 10,000 resamples of the tasks (seed 1337). With one attempt per task it is the share of scored tasks passed. The interval is over tasks: it says how far the rate would move with other tasks like these, not with a rerun of the same ones. |
| difference | akm minus control, task by task, averaged, with its interval from the same resampling. Only tasks both arms have a scored trial for count, and their number is printed. With one attempt each task counts +1, 0 or -1. |
| did better | Those tasks by which arm passed: the akm arm only, the control only, or the same. This is the difference without the averaging, and the one to look at when the two arms disagree on few tasks. |
| akm called | The share of akm trials in which the agent called at least one of the plugin's tools or ran the `akm` command in its shell, counted from opencode's own output, and how often each. |
| read the curated results | The share of akm trials in which the agent read the file the plugin wrote at the start of the session. This is akm reaching the agent without a tool call, and on tasks like these it is the usual way. |
| called, not called | The akm trials split by `akm called`, each split compared with the control on the same tasks. It describes what the model chose. It is not a randomised comparison: whatever made it call akm also made the task what it is. |
| timed out | Trials whose agent ran out of time, in the report next to the errors and not among them. T in the task table marks the tasks. |
| per scored trial | The mean minutes of a scored trial, the minutes of the agent's own run in it, and the dollars the model reports. Most of a trial is setup, and the akm arm's is longer. Errored trials are left out: they stopped in the setup. |

The control has no plugin and no akm, so it never calls akm. The report warns when it does.

The run of 2026-10-06, with `openai/gpt-6-luna`, opencode 1.18.34, akm-cli 0.9.26, the plugin 0.9.26202610051302, Harbor 0.24.0 and the public library, as an example of a read:

- **Errors and timeouts first.** 5 of the 178 trials errored: both arms on `qemu-alpine-ssh` and `qemu-startup` (see "Notes"), and one akm trial, `sanitize-git-repo`, whose session-start curation failed, so the plugin was not shown to be live and the trial was not scored. 11 trials timed out, 6 of the control and 5 of the akm arm, on the same five tasks in both arms and one more in the control. Harbor scored them: one, in the control, passed.
- **Pass rate.** The control passed 60 of its 87 scored tasks, 0.690 [0.586, 0.782]. The akm arm passed 61 of 86, 0.709 [0.616, 0.802].
- **Difference.** +0.012 [-0.058, 0.081] over the 86 tasks both arms scored. The akm arm passed 6 tasks the control failed and failed 5 the control passed, and the two did the same on 75. An exact sign test on the 11 tasks that differ gives p = 1.
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

- A pass rate here is not a Terminal-Bench score. The leaderboard takes at least five trials per task, uploaded publicly to Harbor Hub. This runs one attempt per task, with opencode and a plugin, on a library of ours, on a machine that may be busy with other work. Never put a figure from this benchmark in a table, a chart or a sentence beside a leaderboard row, with or without a footnote. It answers one question: akm against itself on the same tasks.
- Say what a figure is every time it appears: "Terminal-Bench 2.1, 89 tasks, one attempt, opencode 1.18.34 and this model, with and without akm", not "akm improves agent performance".
- Compare runs only with the same dataset digest, model, pins and library, and move one of them at a time. When akm-cli, the plugin, opencode and the model all move together, no difference belongs to any one of them.
- One attempt per task is noisy. A model that passes a task one run may fail it the next, and the paired difference is the sum of a few tasks the two arms disagreed on. In the runs above the control arm alone changed its outcome on 6 of 26 tasks between two runs. Look at `did better` before the interval, and repeat a run before trusting a gap of a few tasks.
- A task measures akm only when the control fails it. Most of these tasks the control passes. They add nothing but noise around zero, and the pass rate of a strong model is mostly the tasks it would have passed anyway.
- Report what looks bad as plainly as what looks good, errored trials and timeouts included.

## Notes

- Two tasks, `qemu-alpine-ssh` and `qemu-startup`, are built on Debian 11 (bullseye). Harbor's opencode installer asks apt for Node and its dependencies in every container, and bullseye's security archive no longer serves them: apt answers 404. Neither arm can be set up, so both arms error on both tasks in every run, until Harbor or the images change. They are two of the 89.
- The arms also differ in ways that are not the treatment. The akm arm does its own start-up work in every session, so it is slower, and wall-clock time is not a quality signal. Its curation call runs inside the task's time limit. Its opencode caches are warm from the warm-up session, while the control's first session fetches opencode's own dependencies inside the measured run. Its container holds about 750 MB more.
- A trial is not repeatable to the letter: the model, the tasks' network access and the load of the machine change from run to run.

## Licence

The code is MPL-2.0. The dataset is Apache-2.0, from the Terminal-Bench team, and is not part of this repository: see `../../NOTICE`.
