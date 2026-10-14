# terminal-bench

Does akm change an agent's pass rate on Terminal-Bench tasks?

[Terminal-Bench 2.1](https://github.com/harbor-framework/terminal-bench-2-1) has 89 tasks an agent does in a container with a terminal: build software, debug a program, set up a service, process data. A task passes when its own tests accept what the agent left. Each task runs with [opencode](https://opencode.ai) alone and with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), on the same model, in Docker through Harbor. The akm arm searches the public library the other evals use, with nothing written for a task, so akm is not expected to move much; the benchmark measures that. This is a paired A/B on one model, not a leaderboard score.

## Run

```
benchmarks/terminal-bench/run --limit 10           # Harbor's ten-task sample: about 30 minutes
benchmarks/terminal-bench/run                      # all 89 tasks: about 7 hours
benchmarks/terminal-bench/run --corpus custom      # the rewritten library: ./generate-assets --only retrieval
benchmarks/terminal-bench/run --cases ~/notes/retrieval
benchmarks/terminal-bench/run --limit 10 --attempts 3 --repeat 2
benchmarks/terminal-bench/run --akm ~/code/akm --akm-env AKM_CURATE_TIMEOUT=30
```

- The corpus is the library the akm arm gets; the tasks are always the same. `public` is `corpus/library`; `custom` is `evals/retrieval`'s rewritten library in `private/retrieval/assets/library`, or the `library/` of `--cases DIR` (a folder in the format `evals/retrieval` reads).
- `--limit N` runs the first N of a fixed order whose first ten are Harbor's `terminal-bench-sample`.
- `--concurrency N` selects simultaneous trials (default 4), recorded in the job.
- `--resume DIR` continues a gracefully interrupted run using the same harness, inputs, model limits, AKM settings and unmodified Harbor configuration. Completed trials are reused through Harbor; the run is marked resumed. Changed protocols require a fresh run. SIGINT/SIGTERM forwards to Harbor and writes a partial summary.
- `--attempts N` runs each task N times per arm (default 1); a task's pass rate is then its share of passed attempts.
- `--semantic` enables AKM hybrid search with its pinned bge-small-en-v1.5 embedder. Setup checks every asset has an embedding and verifies a query reports `searchMode: "semantic"`. The choice and setup proof are saved in the run artifacts.
- `--model`, `--akm` and `--akm-env` work as in `evals/agent-ab` (see its README). The default akm is `akm-cli@0.10.261003-beta`; `AKM_BIN` is not read for the arm.

A run that did not finish everything writes its summary with `status: "aborted"`, exits 1, and is no result.

## What it needs

- Docker, [uv](https://docs.astral.sh/uv/) and bun, and a model set as for `evals/agent-ab`: tool calling, the Responses API, an endpoint a container can reach, a non-empty `MODEL_API_KEY`.
- Internet from the containers, and Docker Hub pulls of up to 89 images (run `docker login` if you pull more than 100 an hour). The images are 75 GB and Harbor leaves them behind: `docker images --format '{{.Repository}}:{{.Tag}}' | grep '^alexgshaw/' | xargs -r docker image rm` removes them. A full run's results are about 5 GB.
- akm on this machine (`AKM_BIN` or `PATH`) to count the library's assets before the run; without it the setup checks less.
- CPU and memory for four containers at a time (up to 4 CPUs and 8 GB each).

A full run with `openai/gpt-6-luna` on 2026-10-06 took 7 hours 6 minutes and cost $3.97; the ten-task sample took 28 minutes and $0.16.

## The data

Harbor fetches the tasks at run time from `terminal-bench/terminal-bench-2-1`, at the digest pinned in `assets/ASSETS.lock`, which also names each task with its digest. Each task keeps its own time limit (15 minutes for most). Terminal-Bench is Apache-2.0 and its maintainers ask that the tasks never reach training data: never commit or publish a task, a solution or a trial folder (`jobs/` quotes the tasks). A test fails when this folder holds a task file or the canary.

## The library

Before Harbor starts, the run indexes the library with the akm on this machine and records the count as `library.assets`. When that akm is the version the arm installs, the arm's setup fails a trial whose index holds fewer assets; otherwise it only checks the index is not empty. Keep the library generic: a library written for these tasks would measure the library, and the leaderboard rules call a task hint cheating. The custom corpus does not change the tasks; it shows whether the akm arm's result depends on the library's exact text.

## The two arms

As in `evals/agent-ab`: the same model, opencode 1.18.34, task, container and time limits. The akm arm adds the plugin, akm-cli with the library seeded and indexed, and the plugin's settings. At session start the plugin curates the five best matches to the task into a file and tells the agent to read it, and it adds the akm tools to the prompt. A trial whose plugin was not shown to be live is an error with no reward. The pinned akm-cli and plugin are installed from lockfiles (see "Dependencies" in `evals/agent-ab/README.md`).

## How a task is scored

A trial is scored when the verifier gave it a reward; otherwise it is errored and left out of the rates. A trial whose agent ran out of time is still verified and is also counted in `timeouts`.

| Figure | Meaning |
|---|---|
| pass rate | the mean over tasks of each task's reward, with a 95% bootstrap interval over tasks |
| difference | akm minus control, per task, over tasks both arms scored, with a paired bootstrap interval |
| sign test, did better | the tasks the arms disagree on, by which arm passed |
| akm called | akm trials in which the agent called a plugin tool or ran `akm` |
| read the curated results | akm trials in which the agent read the plugin's session-start file |
| called, not called | the akm trials split by that, each against the control (not randomised) |
| attempts that disagreed | with `--attempts` above 1, the benchmark's own noise |

## What the summary reports

As `evals/agent-ab`: `status`, `aborted_reason`, `completion`, `metrics`, `report`, `timeouts`, `engine`, `config`, `job`, `pins`, the akm fields and the `manifest`, with `dataset` (the pinned digest and any task whose digest differed) and `library` (`assets`, `measured_with`, `sha256`) in place of agent-ab's library digest. `assets_sha256` covers the library, the selected tasks' digests and the attempts. `samples.jsonl` has one line per task with every trial.

## Results

2026-10-06, `openai/gpt-6-luna`, akm-cli 0.9.26, the public library, one attempt:

- The control passed 60 of 87 scored tasks (0.690), the akm arm 61 of 86 (0.709). The difference is +0.012 [-0.058, 0.081]: the akm arm passed 6 tasks the control failed and failed 5 it passed (p = 1).
- The agent read the curated results in every akm trial and called an akm tool in 24%. What it read was mostly unrelated to the tasks.
- The akm arm cost 37% more per scored trial and took 19% more time.
- A partial custom run (26 tasks) found no dependence on the library's text, and showed the control alone changing its outcome on 6 of 26 tasks between runs: one attempt per task is noisy.

No effect of akm on the pass rate, as expected for a library with nothing about these tasks.

## Notes

- Earlier Debian 11 task images failed package installation because live Bullseye security indexes referenced removed packages ([Debian #1147093](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=1147093)). Both arms now share setup that redirects Bullseye security sources to the signed archive. On glibc, Harbor installs Node through nvm instead of first requesting redundant distro Node packages; musl keeps packaged Node. A setup-only check installed Node 22.23.3 and pinned OpenCode 1.18.34 in `qemu-alpine-ssh:20251031`. Published historical failures remain unchanged.
- Never put a figure from here beside a leaderboard row: the leaderboard takes at least five trials per task, uploaded to Harbor Hub. Say what a figure is: "Terminal-Bench 2.1, 89 tasks, one attempt, opencode 1.18.34 and this model, with and without akm".
- A task measures akm only when the control fails it; most of these the control passes.

## Licence

The code is MPL-2.0. The dataset is Apache-2.0, from the Terminal-Bench team, and is not part of this repository: see `../../NOTICE`.
