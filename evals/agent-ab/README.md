# agent-ab

Does the akm plugin change how often an agent completes tasks where retrieval is the only way in, and does the agent actually call akm?

The tasks are about made-up tools: their commands, flags and file formats are written in a small akm library and nowhere else. Each task runs twice on the same model, with [opencode](https://opencode.ai) alone and with opencode plus the [akm plugin](https://github.com/itlackey/akm-plugins), in Docker through Harbor. A task passes when its verifier accepts what the agent left in the working folder. The eval reports each arm's pass rate, the difference, and whether the agent called akm at all.

This task set is ours. It compares akm with itself across versions; never put its figures beside a published benchmark score.

## Run

```
evals/agent-ab/run
evals/agent-ab/run --repeat 3
evals/agent-ab/run --corpus custom                       # the rewrite: ./generate-assets --only agent-ab
evals/agent-ab/run --cases ~/tasks/agent-ab
evals/agent-ab/run --akm ~/code/akm --akm-env AKM_CURATE_TIMEOUT=30
```

- `--limit N` runs N tasks across the families, once per arm. Without it every task runs 3 times per arm (36 trials, about 30 minutes, four at a time).
- `--model NAME` is the model, resolved as in the other evals (a `models.json` line, or the gateway in `MODEL_BASE_URL` with `MODEL_API_KEY`) and given to opencode as `openai/<id>`. `OPENAI_BASE_URL` and `OPENAI_API_KEY` stand in for empty `MODEL_*` values.
- `--akm` is the akm of the akm arm: an exact npm release (`akm-cli@0.10.261003-beta`, the default) or the folder of an akm checkout, packed with `npm pack` and installed from the tarball. A checkout that holds the plugin (a `package.json` named `akm-opencode`) has it packed too; otherwise the pinned plugin is used. The default CLI comes with plugin `0.10.261002-beta`, and `akm-cli@0.9.26` with plugin `0.9.26202610051302`; each plugin depends on its exact CLI, and all four have committed dependency locks. `AKM_BIN` is not read.
- `--akm-env KEY=VALUE`, repeatable, adds an `AKM_*` setting to the akm arm; this is how a config is swept. The directories, `AKM_OPENCODE_CLI` and credential names are refused.

A run that did not finish everything (Harbor failed, or a task, arm and attempt has no trial) writes its summary with `status: "aborted"`, exits 1, and is no result.

## What it needs

- Docker, [uv](https://docs.astral.sh/uv/) (runs Harbor at its pinned release) and bun; npm only to pack a checkout.
- A model with tool calling, at an endpoint that serves the Responses API (`/v1/responses`) and that a container can reach: not `localhost`. A local server needs a non-empty `MODEL_API_KEY` (any value) and the machine's network address:

  ```
  MODEL_NAME=my-local-model
  MODEL_BASE_URL=http://192.168.1.20:8080/v1
  MODEL_API_KEY=unused
  ```

- Internet from the containers: apt, GitHub, nodejs.org, npm, models.dev and the model; Docker Hub and PyPI for the first image build.

Harbor gets only the model's variables and what it, uv and Docker read.

## Run your own set

`--cases DIR`: a folder with `tasks/` and `libraries/`, laid out as the public ones (Harbor's task format; each `task.toml` names its library as `AKM_TASK_STASH`).

## The tasks

- `tasks/`: 6 tasks, 3 for the made-up `drillbit` and 3 for `inkwell`. Each has `instruction.md`, `environment/`, `solution/solve.sh` and `tests/`. Each `task.toml` lists `library_tokens`, the literals its verifier looks for; a test checks the library holds them and that no instruction or starting file mentions akm or the library.
- `libraries/`: the two akm libraries. Only the task's library is in its container.

The six were chosen because the control failed every attempt in an earlier run, and they have been edited since, so the next run is a new baseline. A task measures akm only while the control fails it; check the per-task table.

The rewrite renames the tools and changes numbers across tasks and libraries together (akm keeps its name). `generate` keeps a task only when its solution passes its verifier, its starting workspace does not, the public solution does not, and its library holds every `library_tokens` literal. Harbor can check the tasks with no model: `-a oracle` should score 1 and `-a nop` 0:

```
uv run --no-project --python 3.12 --with harbor==0.24.0 harbor run -p evals/agent-ab/tasks -a oracle -o evals/agent-ab/results/check -y
```

## The two arms

Both arms get the same model, opencode 1.18.34 and config. The akm arm adds the plugin; akm-cli with a bundle seeded from the task's library and indexed; and the plugin's settings, with background learning off and session-start curation and hints on. A warm-up session checks the plugin loaded before the measured run, and the measured session's log is checked after. A trial whose plugin was not shown to be live is an error with no reward (`AkmPluginNotLoadedError`), never a score. `lib/harbor/akm_opencode.py` is the arm, shared with `benchmarks/terminal-bench`.

## Dependencies

The pinned akm-cli 0.10.261003-beta and plugin 0.10.261002-beta are installed with `npm ci` from lockfiles in `lib/harbor/locks/`, so every container runs the same dependency tree. Each trial records the digest of what was installed, `summary.json` keeps it in `akm_install.dependency_tree_sha256` and folds it into `akm_build_fingerprint`, and a run whose containers installed more than one tree is aborted. A checkout or another release has no lockfile and resolves in each container (`akm_install.locked: false`). To lock a new pin: change it in `lib/harbor/harbor.ts`, make `lib/harbor/locks/<package>-<version>/` with a `package.json` depending on exactly that version, run `npm install --package-lock-only --ignore-scripts` there, and commit both files.

## How a task is scored

A trial is scored when the verifier gave it a reward (1 or 0); otherwise it is errored and left out of the rates. A trial whose agent or setup ran out of time is also counted in `timeouts`; an agent timeout is still verified and keeps its reward.

| Figure | Meaning |
|---|---|
| pass rate | the mean over tasks of each task's share of passed attempts, with a 95% bootstrap interval over tasks |
| difference | akm minus control, per task, averaged over tasks both arms scored; its paired bootstrap also resamples attempts |
| sign test | exact two-sided, on the tasks where the arms differ |
| attempts that disagreed | per arm, tasks whose attempts did not agree: the eval's own noise |
| akm called | the share of akm trials in which the agent called a plugin tool or ran `akm` in its shell |
| called, not called | the akm trials split by that, each against the control on the same tasks (not randomised) |
| read the curated results | akm trials in which the agent read the file the plugin writes at session start |

Read `status`, then `completion`, then engagement before the difference: where the agent never called akm, the arms differ only by the plugin's hints and curated context. Six tasks move by a task or two between runs: use `--repeat 3`.

## What the summary reports

`summary.json`: `status`, `aborted_reason`, `completion` (`expected`, `completed`, `failed`, `missing`, `unexpected`, overall and per arm), `metrics` (per arm `pass_rate`, `passed`, `scored`, `errored`, `timeouts`; `delta`; `better`; `engagement`), `report` (with `sign_test` and `flips`), `timeouts` by arm, `engine` (model and endpoint host), `config` (the Harbor job, credentials redacted), `job`, `pins`, `akm_version`, `akm_bin`, `akm_build`, `akm_env`, `akm_install`, `assets_sha256` (over the run's copy of the tasks and libraries, and the attempts), `libraries_sha256`, `seed`, `corpus_folder` and the `manifest`. `samples.jsonl`: one line per task with every trial of both arms (reward, exception, `timed_out`, akm tools called, tokens, time). The run folder also keeps its copy of `tasks/` and `libraries/`, any `akm-packages/`, and Harbor's `jobs/`.

## Notes

- The arms differ in ways that are not the treatment: the akm arm does start-up work in every session and has warm caches, so wall-clock time is not a quality signal.
- The plugin's own copy of akm-cli has no SQLite binding on Node, so the arm points `AKM_OPENCODE_CLI` at the akm-cli it installed, which is also the `akm` in the agent's shell.

## Licence

MPL-2.0.
