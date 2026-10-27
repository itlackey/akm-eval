# agent-ab: repomap tasks

A task family for [akm#1260](https://github.com/itlackey/akm/issues/1260) part A: does a repo map, stored as an ordinary akm knowledge asset and fetched by ref, help an agent find its way around a repository? It is not part of the public six-task set, so that comparison does not change. Run it with `--cases`:

```
evals/agent-ab/run --cases evals/agent-ab/cases/repomap --akm <checkout> --semantic
```

## The tasks

Seven localization tasks over [itlackey/akm](https://github.com/itlackey/akm) at `f8f97704672ae657e9590d1240150df3a88b18ee` (MPL-2.0, like this repository). Each `environment/Dockerfile` downloads that commit's source archive from GitHub into `/app/repo`, without its git history. The repository sits below the working directory `/app` so that opencode does not load the repository's own `AGENTS.md` as instructions. Each instruction describes what a function does, in words, and asks the agent to write one line to `/app/answer.txt`: the file that defines it, relative to the repository root, and the function's name.

| Task | File | Function |
|---|---|---|
| `repomap--robots-check` | `src/sources/snapshot-fetchers/robots.ts` | `isPathAllowedByRobots` |
| `repomap--npm-integrity` | `src/core/npm-package.ts` | `verifyIntegrity` |
| `repomap--unknown-flags` | `src/cli/unknown-flags.ts` | `assertKnownFlags` |
| `repomap--workflow-parse` | `src/workflows/parser.ts` | `parseWorkflow` |
| `repomap--non-task-input` | `src/core/non-task-input.ts` | `nonTaskInput` |
| `repomap--markdown-fragments` | `src/core/asset/markdown-fragments.ts` | `splitMarkdownFragments` |
| `repomap--search-projection` | `src/indexer/passes/metadata.ts` | `projectMarkdownContent` (or `projectMarkdownFragmentContent`, the fragment projection in the same file, which drops fenced code too) |

Each answer was checked against the akm source at that commit. The questions were written from the source and the map before any model ran them. `tests/verify.sh` passes a task when `answer.txt` has exactly one non-empty line, that line names the expected file as its only `.ts` path (a leading `./` or `/app/repo/` and a `:line` suffix are accepted), and it names an accepted function as a whole word. `task.toml` sets `task_family = "repomap/localize"`, names the library as `AKM_TASK_STASH = "repomap"`, and lists the file and the function in `library_tokens`; `src/lib.test.ts` checks that the gold ref (the map asset of the file's top-level directory) holds both, and that no instruction points the agent at akm.

## The library

`libraries/repomap/` is a copy of `evals/retrieval/assets/repomap/library`: the inline-code repo map of akm's `src/` at the same commit, one knowledge asset per top-level directory (`knowledge/akm-map/src/<dir>`). Its README says how it was generated. The control arm has the repository only; the akm arm also has this library, through the plugin.

## Checking the tasks without a model

```
uv run --no-project --python 3.12 --with "harbor==$(bun lib/harbor/pin.ts harbor)" harbor run -p evals/agent-ab/cases/repomap/tasks -a oracle -o <folder> -y   # every task scores 1
uv run --no-project --python 3.12 --with "harbor==$(bun lib/harbor/pin.ts harbor)" harbor run -p evals/agent-ab/cases/repomap/tasks -a nop -o <folder> -y      # every task scores 0
```

## Limits

- Seven tasks: one task moves a pass rate by about 0.14.
- The control can search the repository with grep, and the function names are in the source, so the question is how much effort the map saves (tokens, time and tool calls per trial), as much as whether the task passes.
- The map is of akm itself, so its words come from the same source as the questions.
