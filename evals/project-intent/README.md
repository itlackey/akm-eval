# project-intent

With a project registered for the agent's working directory, does an agent that never passes a selection flag use the right project's knowledge, keep away from a conflicting project's, and still find general knowledge, at equal or fewer tokens?

akm 0.10.261111 adds `projects` to akm's config ([akm#1461](https://github.com/itlackey/akm/issues/1461)): a named entry lists directories and the read and write defaults akm applies when it runs inside one. A bare entry (`{ "paths": [...] }`) prefers `project: <name>` (the ×1.02 boost) and stamps it on writes. The plugin runs every akm call in the session's directory, so an agent gets the project without ever passing `--project`, `--filter` or `--prefer`. This eval measures whether that helps an agent, and whether the bare entry's name convention earns its place.

This task set is ours. It compares akm configurations with each other on one model; never put its figures beside a published benchmark score.

## Why not agent-ab

agent-ab compares opencode alone with opencode plus the akm plugin, in a two-arm job and a two-arm report. This question compares three configurations of the akm arm, all with the plugin. In agent-ab it would take three runs, each with an opencode-alone control that can only fail these tasks, compared across runs with no paired interval. So this eval reuses agent-ab's machinery (lib/harbor: the job, the akm arm, the trial reader, the bootstrap and sign test, and agent-ab's task checks) and adds only the arms, the tasks and a scorer for more than two arms.

## Run

```
evals/project-intent/run --model NAME                      # 28 tasks x 3 arms x 4 attempts = 336 trials
evals/project-intent/run --model NAME --limit 2            # 2 tasks, once per arm: a setup check
evals/project-intent/run --model NAME --akm ~/code/akm     # an akm checkout (packed, as in agent-ab)
```

The flags are agent-ab's (see its README for `--concurrency`, `--semantic`, `--akm`, `--akm-env` and what the model needs), without `--repeat`. `--cases DIR` runs a folder of your own with `tasks/`, `libraries/` and `projects.json`. There is no rewrite, so `--corpus custom` and `all` need `--cases`.

The default akm is `akm-cli@0.10.261111-beta` with `akm-opencode@0.10.261110-beta`, the first plugin release that runs akm in the session's directory; it depends on exactly that CLI. The plugin installs from its committed lockfile (`lib/harbor/locks/`); the CLI does not: on the containers' Node 22 without a compiler, `npm ci` from a lockfile drops akm's optional SQLite driver (`better-sqlite3` 13 runs `node-gyp rebuild` there, fails, and is left out), while `npm install akm-cli@0.10.261111-beta` keeps its prebuilt binding. So `akm_install.locked` is false, as in the 0.10.261110-beta agent-ab round, and the run is aborted if its containers install different trees. Projects need akm 0.10.261111 or later: on an older akm the seed's `akm config set projects` fails and the trial errors. Another `--akm` release gets lib/harbor's plugin choice for it (`RELEASE_PLUGINS`, else the agent-ab pin, which carries an older akm in process and does not pass the session directory): check `pins` in the summary.

## The arms

`projects.json` names the arms; every arm is lib/harbor's akm arm with the same akm, plugin, model, opencode and config, and the seed of each writes its `projects` into akm's config. Nothing else differs, and no arm is opencode alone.

| Arm | `projects` |
|---|---|
| `none` | none: akm as before 0.10.261111 |
| `bare` | `orchid: { paths: ["/work/orchid"] }`, `quill: { paths: ["/work/quill"] }`: the name convention only (prefer `project=<name>`) |
| `explicit` | the same paths with `filters: { project: [<name>, ""] }`: the project's notes and unscoped ones, never the other project's; the convention still adds the preference |

So `bare` minus `none` is the name convention, and `explicit` minus `bare` is the hard filter on top of it. Harbor records each arm as the agent `akm-opencode-<arm>`.

## The tasks

The library `libraries/teams` is one bundle for every task: a skill for the made-up `quaystone` CLI and 28 memories.

- **Conflict tasks (24).** Twelve questions (the pool a service ships to, the health port, the log retention, the image mirror, the replica count, the alert channel, the backup window, the release tag prefix, the region, the drain grace period, the vault path, the nightly cron schedule), each answered by two memories with the same description and tags, one with `project: orchid` and one with `project: quill`, as a bare entry would have stamped them. The memories' names and bodies do not say which project they belong to. Each question runs once in `/work/orchid` and once in `/work/quill`, so an agent that always takes the same note passes half of them.
- **General tasks (4, two per directory).** The answer is in a memory with no `project` key (the hold time after a rewind, the lock file's first line, the config file's path, the exit code of a locked pool), so a project's filter must keep it: the `""` in `explicit`'s filter.

The instruction gives the working directory and the question, and never mentions akm, a library, a skill or a project; `run.test.ts` checks that with agent-ab's checks, that each gold note holds the verifier's answer and the other project's note the other answer, and that each working directory is inside its project's `paths`. A task's verifier writes `reward.json`: `reward` is 1 when a line of the answer file is exactly the expected answer and the other project's value is nowhere in it, and `other_project` is 1 when the other project's value is in the file. Harbor's oracle agent scores 28 of 28 and its nop agent 0 of 28:

```
uv run --no-project --python 3.12 --with "harbor==$(bun lib/harbor/pin.ts harbor)" harbor run -p evals/project-intent/tasks -a oracle -o evals/project-intent/results/check -y
```

The write path (a bare entry stamps `project: <name>` on `akm remember`) is left out on purpose: it does not depend on the model, and akm's own tests cover it.

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

The owner's rule is that a feature must improve results at about equal tokens, or cut tokens. Read it per comparison:

- **The name convention earns its place** when `bare - none` is above 0 with the lower end of its interval above 0, `bare`'s tokens per correct outcome are no more than 5% above `none`'s, and `bare`'s general pass rate is not below `none`'s.
- An interval that holds 0 is no evidence for the convention: by the owner's rule, unproven is dropped by default. Read `explicit - none` beside it: when only the filter helps, the measured-good part is the explicit filter, not the convention.
- `other project` should fall from `none` to `bare` to `explicit`; `explicit` should be at 0 unless the agent guessed a value.

## Limits

- Size. 28 tasks and 4 attempts were sized with lib/harbor's paired bootstrap on simulated runs (conflict tasks passing between 0.1 and 0.9 in `none`, general tasks at 0.8 in both arms): the `bare - none` interval is about 0.29 wide (±0.14), and a rise of 0.25 in the conflict tasks' pass rate (about 0.2 over all tasks) puts its lower end above 0 in about 80% of runs, 0.2 in about 60%. A smaller effect is likely to read as unproven. A served model need not be deterministic, so attempts can disagree; read the per-task table.
- The projects are named after their directories (`/work/orchid`), and the memories carry `project:` in frontmatter, which `akm show` prints. An agent without a project can still match the two; that is the realistic case, and the difference measures what the project adds to it.
- The arms share one library, so `none` sees exactly the knowledge the other arms see, only unranked by project and unfiltered.
- One model per run. Tokens come from opencode's stream as Harbor reads it, so a side call opencode makes outside the session is not counted, in any arm.

## What the summary reports

`summary.json`: `status`, `aborted_reason`, `completion` (per arm: `expected`, `completed`, `failed`, `missing`, `unexpected`), `arms` (each label with its `projects`), `metrics` (per arm `pass_rate`, `conflict_pass_rate`, `general_pass_rate`, `passed`, `scored`, `errored`, `other_project_rate`, `akm_called_rate`, `tokens_per_trial`, `tokens_per_correct`; per comparison `value`, `lo`, `hi`, `n`, `sign_p`), `report` (the full figures and the per-task table), `pins`, `akm_version`, `akm_bin`, `akm_install`, `engine`, `config`, `job`, `libraries_sha256`, `tasks_sha256`, `arms_sha256`, `assets_sha256` and the `manifest`. `samples.jsonl`: one line per task with its kind, the arms and every trial (reward, `other_project`, exception, akm tools called, tokens, time). A run that did not finish everything is `aborted`, exits 1, and is no result.

To publish a run, copy its `summary.json` and `samples.jsonl` to `reports/<akm version>/project-intent/<run>/` and add its row to `reports/README.md`, as for the other evals. The ledger lists it under Project knowledge: the `bare` arm's pass rate is the primary score, beside each arm's pass rate, other-project rate and tokens per correct outcome and the two gains over `none` with their intervals (`scripts/ledger/src/presentation.ts`).

## Licence

MPL-2.0.
