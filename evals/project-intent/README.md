# project-intent

With a project registered for the agent's working directory, does an agent that never passes a selection flag use the right project's knowledge, keep away from a conflicting project's, and still find general knowledge, at equal or fewer tokens?

akm 0.10.261111 adds `projects` to akm's config ([akm#1461](https://github.com/itlackey/akm/issues/1461)): a named entry lists directories and the read and write defaults akm applies when it runs inside one. A bare entry (`{ "paths": [...] }`) prefers `project: <name>` (the ×1.02 boost) and stamps it on writes. The plugin runs every akm call in the session's directory, so an agent gets the project without ever passing `--project`, `--filter` or `--prefer`. This eval measures whether that helps an agent, and whether the bare entry's name convention earns its place.

This task set is ours. It compares akm configurations with each other on one model; never put its figures beside a published benchmark score.

## Why not agent-ab

agent-ab compares opencode alone with opencode plus the akm plugin, in a two-arm job and a two-arm report. This question compares three configurations of the akm arm, all with the plugin. In agent-ab it would take three runs, each with an opencode-alone control that can only fail these tasks, compared across runs with no paired interval. So this eval reuses agent-ab's machinery (lib/harbor: the job, the akm arm, the trial reader, the bootstrap and sign test, and agent-ab's task checks) and adds only the arms, the tasks and a scorer for more than two arms.

## Run

```
evals/project-intent/run --model NAME                      # 80 tasks x 3 arms x 4 attempts = 960 trials
evals/project-intent/run --model NAME --limit 2            # 2 tasks, once per arm: a setup check
evals/project-intent/run --model NAME --akm ~/code/akm     # an akm checkout (packed, as in agent-ab)
```

The flags are agent-ab's (see its README for `--concurrency`, `--semantic`, `--akm`, `--akm-env` and what the model needs), without `--repeat`. `--cases DIR` runs a folder of your own with `tasks/`, `libraries/` and `projects.json`. There is no rewrite, so `--corpus custom` and `all` need `--cases`.

Fewer arms need no code: the arms are the entries of the `projects.json` in the folder `--cases` names. To compare only `none` and `bare` (80 x 2 x 4 = 640 trials, a third fewer), copy the tasks and the library into a folder inside the repository (its `private/` is ignored by git) and give it a `projects.json` of those two arms:

```
cases=private/project-intent/none-bare
mkdir -p $cases && cp -r evals/project-intent/tasks evals/project-intent/libraries $cases/
jq '{none, bare}' evals/project-intent/projects.json > $cases/projects.json
evals/project-intent/run --model NAME --cases $cases   # results in private/project-intent/results/
```

A `--cases` run is a custom corpus: it writes its summary under `private/`, and its arms (`arms_sha256`) differ from the public ones, so compare it only with runs of the same arms.

The default akm is `akm-cli@0.10.261111-beta` with `akm-opencode@0.10.261110-beta`, the first plugin release that runs akm in the session's directory; it depends on exactly that CLI. The plugin installs from its committed lockfile (`lib/harbor/locks/`); the CLI does not: on the containers' Node 22 without a compiler, `npm ci` from a lockfile drops akm's optional SQLite driver (`better-sqlite3` 13 runs `node-gyp rebuild` there, fails, and is left out), while `npm install akm-cli@0.10.261111-beta` keeps its prebuilt binding. So `akm_install.locked` is false, as in the 0.10.261110-beta agent-ab round, and the run is aborted if its containers install different trees. Projects need akm 0.10.261111 or later: on an older akm `akm config set projects` exits 0 and stores a key akm ignores, so the seed follows it with `akm config get projects`, which exits 2 there, and the trial errors. Another `--akm` release gets lib/harbor's plugin choice for it (`RELEASE_PLUGINS`, else the agent-ab pin, which carries an older akm in process and does not pass the session directory): check `pins` in the summary.

## The arms

`projects.json` names the arms; every arm is lib/harbor's akm arm with the same akm, plugin, model, opencode and config, and the seed of each writes its `projects` into akm's config. Nothing else differs, and no arm is opencode alone.

| Arm | `projects` |
|---|---|
| `none` | none: akm as before 0.10.261111 |
| `bare` | `orchid: { paths: ["/work/orchid"] }`, `quill: { paths: ["/work/quill"] }`: the name convention only (prefer `project=<name>`) |
| `explicit` | the same paths with `filters: { project: [<name>, ""] }`: the project's notes and unscoped ones, never the other project's; the convention still adds the preference |

So `bare` minus `none` is the name convention, and `explicit` minus `bare` is the hard filter on top of it. Harbor records each arm as the agent `akm-opencode-<arm>`.

## The tasks

The library `libraries/teams` is one bundle for every task: a skill for the made-up `quaystone` CLI and 80 memories.

- **Conflict tasks (68).** Thirty-four questions: the first run's twelve (the pool a service ships to, the health port, the log retention, the image mirror, the replica count, the alert channel, the backup window, the release tag prefix, the region, the drain grace period, the vault path, the nightly cron schedule) and 22 added (below), each answered by two memories with the same description and tags, one with `project: orchid` and one with `project: quill`, as a bare entry would have stamped them. The memories' names and bodies do not say which project they belong to. Each question runs once in `/work/orchid` and once in `/work/quill`, so an agent that always takes the same note passes half of them. The 22 added ask for the request timeout, the CPU cap, the memory limit, the canary's traffic share, the cooldown between ships, the owning team, the release-notes address, the runtime version, the no-ship weekday, the cost center, the job queue (each a `quaystone` command the skill describes), and the log level, the image registry path, the default branch, the on-call shift length, the staging host, the pre-merge check, the metric prefix, the status page slug, the hotfix branch prefix, the artifact bucket and the DNS zone (a value to write down).
- **General tasks (12, six per directory).** The answer is in a memory with no `project` key (the hold time after a rewind, the lock file's first line, the config file's path, the exit code of a locked pool, and eight more: how long a pool lock lasts, the variable that holds the API token, the report file extension, the command that prints the version, the cache directory, the largest ship batch, the command that lists every pool, the exit code of a failed probe), so a project's filter must keep it: the `""` in `explicit`'s filter.

The instruction gives the working directory and the question, and never mentions akm, a library, a skill or a project; `run.test.ts` checks that with agent-ab's checks, that each gold note holds the verifier's answer and the other project's note the other answer, and that each working directory is inside its project's `paths`. A task's verifier writes `reward.json`: `reward` is 1 when a line of the answer file is exactly the expected answer and the other project's value is nowhere in it, and `other_project` is 1 when the other project's value is in the file. Harbor's oracle agent scores 80 of 80 and its nop agent 0 of 80; run on every verifier by hand, the other project's answer, a hedge that holds both answers (on two lines, or in one line) and a wrong answer score 0 on all 68 conflict tasks, the first two with `other_project` 1:

```
uv run --no-project --python 3.12 --with "harbor==$(bun lib/harbor/pin.ts harbor)" harbor run -p evals/project-intent/tasks -a oracle -o evals/project-intent/results/check -y
```

The write path (a bare entry stamps `project: <name>` on `akm remember`) is left out on purpose: it does not depend on the model, and akm's own tests cover it.

The first 28 tasks are the first run's (reports/0.10.261111-beta), byte for byte, and later task sets only append, so its trials can be pooled with a later run's of the same arms. The library grew since, though (28 memories and a shorter skill then), so those 28 tasks now ask their questions among more notes.

## Metrics

Per arm, over the scored trials (a trial is scored when the verifier gave it a reward):

| Figure | Meaning |
|---|---|
| pass rate | the mean over tasks of each task's share of passed attempts, with a 95% bootstrap interval over tasks; also for the conflict and the general tasks apart |
| difference | for every two arms (`bare - none`, `explicit - none`, `explicit - bare`), per task, averaged over the tasks both scored, with lib/harbor's paired bootstrap (tasks, then attempts) and an exact sign test |
| other project | conflict trials whose answer held the other project's value |
| akm called | trials in which the agent called a plugin tool or ran `akm` in its shell; and how many read the results the plugin curated at session start |
| tokens | input (and cached) and output tokens as Harbor records them, over every trial that reported them, errored ones too; per trial and **per correct outcome** (input plus output, divided by the passed trials) |

## Pass rule

The owner's rule is that a feature must improve results at about equal tokens, or cut tokens.

**Revised 2026-11-07, before any result of the `opencode-zen/qwen3.8-flash` run existed.** The first rule made the pass rate the primary test. The pass rate moves with things the name convention does not touch: agent exits and timeouts scored 0 in every arm, tasks every arm passes or fails, and the agent's own reading of the notes. The convention's job is to keep the agent on its project's notes, and the `other project` rate measures exactly that. The first run (35B, 28 tasks) read that rate down from 9.4% to 1.0% (`bare - none` -0.083, interval -0.156 to -0.021, 8 tasks down and 0 up), while the pass rate read +0.098 with an interval holding 0. Read each comparison against these three tests, in this order:

1. **Primary: `other project` rate, `bare - none`.** Use lib/harbor's `pairedEstimate` over the conflict tasks, with each trial's `other_project` as its value. It passes when the upper end of the 95% interval is below 0.
2. **Guard: pass rate, `bare - none`.** The lower end of its 95% interval must be above -0.05: the convention may not cost correct answers. Also, `bare`'s tokens per correct outcome must be no more than 5% above `none`'s.
3. **Supporting: pass-rate gain.** Run lib/harbor's `signTest` on the tasks where the arms differ, pooled across every published run of this eval (one count per task and model; a task asked of two models counts twice). A result below 0.05 means the gain is shown. A result at or above 0.05 does not fail the convention when tests 1 and 2 pass.

**The convention earns its place** when tests 1 and 2 pass on every model run. A failed test 1, or a failed test 2, is evidence against it, and by the owner's rule it is dropped. Read `explicit - none` beside it. When only the filter helps, the measured-good part is the explicit filter, not the convention. `other project` should fall from `none` to `bare` to `explicit`, and `explicit` should be at 0 unless the agent guessed a value.

## Limits

- Size. 80 tasks and 4 attempts were sized with lib/harbor's paired bootstrap on simulated runs (200 per effect; conflict tasks passing between 0.1 and 0.9 in `none`, general tasks at 0.8 in both arms; the same simulation gave the 28-task set's 0.29 and 80% below): the `bare - none` interval is about 0.17 wide (±0.09, against 0.29 for 28 tasks), and a rise in the conflict tasks' pass rate of 0.25 or 0.2 (about 0.21 and 0.17 over all tasks) puts its lower end above 0 in all runs, 0.15 in about 87%, 0.1 (about 0.085 over all tasks) in about 46%. The first 28-task run read +0.098 over all tasks (about 0.11 in the conflict tasks), so an effect that size is a coin flip to read as proven, and a smaller one is likely to read as unproven. The 28-task set had 80% at 0.25 (about 90% with 5 attempts), 60% at 0.2, 32% at 0.15 and 12% at 0.1. A served model need not be deterministic, so attempts can disagree; read the per-task table.
- The projects are named after their directories (`/work/orchid`), and the memories carry `project:` in frontmatter, which `akm show` prints. An agent without a project can still match the two; that is the realistic case, and the difference measures what the project adds to it.
- The arms share one library, so `none` sees exactly the knowledge the other arms see, only unranked by project and unfiltered.
- One model per run. Tokens come from opencode's stream as Harbor reads it, so a side call opencode makes outside the session is not counted, in any arm.

## What the summary reports

`summary.json`: `status`, `aborted_reason`, `completion` (per arm: `expected`, `completed`, `failed`, `missing`, `unexpected`), `arms` (each label with its `projects`), `metrics` (per arm `pass_rate`, `conflict_pass_rate`, `general_pass_rate`, `passed`, `scored`, `errored`, `other_project_rate`, `akm_called_rate`, `tokens_per_trial`, `tokens_per_correct`; per comparison `value`, `lo`, `hi`, `n`, `sign_p`), `report` (the full figures and the per-task table), `pins`, `akm_version`, `akm_bin`, `akm_install`, `engine`, `config`, `job`, `libraries_sha256`, `tasks_sha256`, `arms_sha256`, `assets_sha256` and the `manifest`. `samples.jsonl`: one line per task with its kind, the arms and every trial (reward, `other_project`, exception, akm tools called, tokens, time). A run that did not finish everything is `aborted`, exits 1, and is no result.

To publish a run, copy its `summary.json` and `samples.jsonl` to `reports/<akm version>/project-intent/<run>/` and add its row to `reports/README.md`, as for the other evals. The ledger lists it under Project knowledge: the `bare` arm's pass rate is the primary score, beside each arm's pass rate, other-project rate and tokens per correct outcome and the two gains over `none` with their intervals (`scripts/ledger/src/presentation.ts`).

## Licence

MPL-2.0.
