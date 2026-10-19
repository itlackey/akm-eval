# bakeoff

Does the model do what akm asks of it, in the model-backed jobs of akm that no other eval measures?

Five of akm's model-backed jobs are scored by no other eval. This eval runs those five with akm's own commands in a sandbox, with the model under test as the engine, and scores what akm wrote. The prompts, parsers and repair turns are akm's, so a better prompt in a release moves the numbers. It runs one model at a time: to compare models, run it once per `--model` and compare with `scripts/compare`. Needs akm 0.9.26 or later. (It replaces a Python bakeoff that scored a frozen copy of akm's prompts; see `reports/retired-evals.md`. No old result carries over.)

## The five processes

| Process | Cases | The command | What akm writes, and the eval reads |
|---|---:|---|---|
| `memory-inference` | 8 | `akm improve --strategy bakeoff-memory-inference` | `memories/<name>.derived.md`: title, description, tags, search hints, content |
| `remember-enrich` | 8 | `akm remember --enrich --name <name>`, the memory on stdin | `memories/<name>.md` with the tags, description and date the model gave |
| `schema-repair` | 8 | `akm improve <lesson> --strategy bakeoff-schema-repair` | a pending `schema-repair` proposal: the lesson with a `description` and a `when_to_use` |
| `session-summary` | 8 | `akm proposal extract --type claude --session-id <id> --strategy bakeoff-session-summary` | `sessions/claude/<id>.md`: the summary and a `## Key topics` list |
| `consolidate-promote` | 8 | `akm improve --strategy bakeoff-consolidate-promote` | the promotions in consolidate's plan, `consolidation.planned` |

Each strategy runs its one process. Memory inference is behind `experimental.improveAutonomy`, which the config sets. Without `--semantic`, semantic search is off, so consolidate's pair pass finds no pairs.

## Run

Use the [prebuilt Docker runner](../../docker/README.md); no host package
installation is needed. The examples below are commands to append after the
image name in `docker run` (see the root setup).

```
evals/bakeoff/run
evals/bakeoff/run --model qwen3-27b --process schema-repair
evals/bakeoff/run --corpus custom              # the rewrite: ./generate-assets --only bakeoff
evals/bakeoff/run --cases ~/notes/bakeoff
```

`--process NAME` runs one process. `--limit N` takes the first case of each process in turn. `--config-patch FILE` changes the config, and `--semantic` adds akm's native embedder to it (semantic search is off otherwise); there is no `--strategy`, since each process has its own. `--concurrency N` runs N cases at a time, each in a sandbox of its own (default 1). `--timeout-ms N` stops an akm command that is still running after N milliseconds (default 900000, 15 minutes). A full run is 40 cases and about 75 calls, one at a time; 16k of context is safe. The eval sets temperature 0 and thinking off. The run gives up when five cases in a row end in an error: it starts no new case, writes the summary with `status: "aborted"` and the reason, and exits 1.

## Run your own set

`--cases DIR`: a folder with a `cases.json` and the files it names, laid out like `assets/`.

## The cases

`assets/cases.json`: 40 cases, 8 of each process, each with its `id`, `process`, the `files` it reads and what it `expected`, over a fictional library of 66 memories, 8 lessons lacking `description` and `when_to_use`, and 8 Claude Code sessions. The rewrite changes files and `cases.json` with one mapping, and `generate` checks every expected term and ref still holds.

## How a case is scored

akm exits 0 whatever the model did, so the outcome comes from what akm wrote: `output` (scored), `unusable` (akm could not use the reply; never correct) or `error` (a failed call, crash, timeout or dead endpoint; left out of the counts). A case is correct when its output has the right shape and every check holds.

| Process | The shape | The checks |
|---|---|---|
| `memory-inference` | non-empty title, description, content; 3 to 8 tags; 3 to 6 search hints | `retains <term>`, `retains explicit date`, `does not invent <term>` |
| `remember-enrich` | 1 to 5 lower-case tags, a description | `preserves explicit date`, or `does not invent an observation date`; `metadata covers <keyword>` |
| `schema-repair` | `description` of 20+ characters, `when_to_use` of 15+ | `generated fields are grounded in the body`, `trigger is concrete` |
| `session-summary` | a summary of 80+ characters, non-empty topics and tags | `summary retains <term>`, `topics include <term>`, `summary omits <term>` |
| `consolidate-promote` | akm accepted a plan | `promotes <ref>`, `leaves protected <ref> untouched`, `no extra or missing promotions` (strict cases), `promotes only memories of the pool` |

Terms match with case and spacing ignored; a one-word term ending in `y` also finds `ies`, `ied` and `ying`. The promotion checks read the model's plan, not the queue, since akm drops some promotions before queueing them.

| Metric | Meaning |
|---|---|
| `valid_output` | cases with the right shape, of those that ran |
| `case_pass` | cases with the right shape and every check |
| `checks` | the mean share of each case's checks that held (a wrong shape earns none) |
| `median_seconds` | median time per case, which depends on the server |
| `by_process` | per process: `n`, `valid_output`, `passed`, `checks`, `outcomes`, `failed` |

One case is 2.5 points of `case_pass`, and 12.5 points of its process, which has 8 cases: compare by `checks` and rerun with `--repeat`.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts` (akm past `--timeout-ms`), `status` and `aborted_reason` (it aborts after five errored cases in a row), `served` (empty for remember-enrich and session-summary), `process`, the model, akm version and build, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder`, `concurrency`, `timeout_ms` and the `manifest`. `samples.jsonl`: one row per case with the outcome, the checks, and the raw output: the derived memory, written memory, repair proposal, session asset, or plan and promotions.

`src/real.test.ts` runs every public case through a real akm against a scripted model, with `AKM_EVAL_REAL_AKM=1` and `AKM_BIN` set.

## Notes

- These processes are Evolving or Experimental in akm's stability policy.
- A session summary follows extract's own call, so `session-summary` needs two good replies; extract itself is scored by `evals/extract`.
- akm's error messages name its endpoint; the eval writes `<MODEL_BASE_URL>` in its place.

## Licence

MPL-2.0.
