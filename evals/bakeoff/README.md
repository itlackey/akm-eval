# bakeoff

Does the model do what akm asks of it, in the model-backed jobs of akm that no other eval measures?

Five of akm's model-backed jobs are scored by no other eval. This eval runs those five with akm's own commands in a sandbox, with the model under test as the engine, and scores what akm wrote. The prompts, parsers and repair turns are akm's, so a better prompt in a release moves the numbers. It runs one model at a time: to compare models, run it once per `--model` and compare with `scripts/compare`. Needs akm 0.9.26 or later; memory inference scores a no-change decision only with an akm that reports `memoryInference.noChange` (akm#1208, `release/0.10.0`). (It replaces a Python bakeoff that scored a frozen copy of akm's prompts; see `reports/retired-evals.md`. No old result carries over.)

## The five processes

| Process | Cases | The command | What akm writes, and the eval reads |
|---|---:|---|---|
| `memory-inference` | 23 | `akm improve --strategy bakeoff-memory-inference` | `memories/<name>.derived.md`: title, description, tags, search hints, content; or no file and akm's count of a no-change decision, `memoryInference.noChange` |
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

`--process NAME` runs one process. `--limit N` takes the first case of each process in turn. `--config-patch FILE` changes the config, and `--semantic` adds akm's native embedder to it (semantic search is off otherwise); there is no `--strategy`, since each process has its own. `--concurrency N` runs N cases at a time, each in a sandbox of its own (default 1). `--timeout-ms N` stops an akm command that is still running after N milliseconds (default 900000, 15 minutes). A full run is 55 cases, one at a time; 16k of context is safe. The eval sets temperature 0 and thinking off. The run gives up when five cases in a row end in an error: it starts no new case, writes the summary with `status: "aborted"` and the reason, and exits 1.

## Run your own set

`--cases DIR`: a folder with a `cases.json` and the files it names, laid out like `assets/`.

## The cases

`assets/cases.json`: 55 cases, 8 of each process but memory inference, which has 23, each with its `id`, `process`, the `files` it reads and what it `expected`, over a fictional library of 81 memories, 8 lessons lacking `description` and `when_to_use`, and 8 Claude Code sessions. The rewrite changes files and `cases.json` with one mapping, and `generate` checks every expected term and ref still holds.

## How a case is scored

akm exits 0 whatever the model did, so the outcome comes from what akm wrote and counted: `output` (scored), `no-change` (memory inference only: the model decided the note needs no derived memory, and akm counted it in `memoryInference.noChange`), `unusable` (akm could not use the reply; never correct) or `error` (a failed call, crash, timeout, dead endpoint, a pass that did not run, or a missing derived memory that akm's counters do not explain; left out of the counts). A missing derived memory is never a no-change by itself: an akm that does not report `noChange` gives `unusable`. A case is correct when its output has the right shape and every check holds, or, for a `no-change` on a case that expects it, when every check holds.

| Process | The shape | The checks |
|---|---|---|
| `memory-inference` | non-empty title, description, content; 3 to 8 tags; 3 to 6 search hints; none for a no-change | `retains <term>`, `retains explicit date`, `carries observation date` and `preserves scope` when labeled, `does not invent <term>`; `decides no-change` on a case with `"noChange": true`; `does not abstain` fails a no-change on any other case |
| `remember-enrich` | 1 to 5 lower-case tags, a description | `preserves explicit date`, or `does not invent an observation date`; `metadata covers <keyword>` |
| `schema-repair` | `description` of 20+ characters, `when_to_use` of 15+ | `generated fields are grounded in the body`, `trigger is concrete` |
| `session-summary` | a summary of 80+ characters, non-empty topics and tags | `summary retains <term>`, `topics include <term>`, `summary omits <term>` |
| `consolidate-promote` | akm accepted a plan | `promotes <ref>`, `leaves protected <ref> untouched`, `no extra or missing promotions` (strict cases), `promotes only memories of the pool` |

Memory inference has two kinds of case. A note that needs no derived memory (a tool-call tally, a checkpoint or resume marker, an already short and specific note) expects `"noChange": true`: a no-change passes it, and a child, however well formed, is unjustified and fails it. Every other note must get a child that keeps its `required` terms (and `date`): a no-change there is a false abstention and fails, so a model that always abstains passes only the first kind. `does not invent <term>` fails when the term is asserted in the title, description, tags, hints or content, and does not fail on a mention that one of the four words before it, in the same clause, negates ("was not rotated", "never run", "isn't"); a case lists the claims that would change the meaning of the note (a request told as done, a lookup told as a run, a historical value told as current) as `forbidden`, and keeping the date alone does not make such a summary pass. The check is a finite word list and no judge; it can be fooled by an unrelated negation.

A `date` is a term like the others: it must appear in the child's title, description, tags, hints or content. An `observed` expectation is for a parent note that carries an observation date in its frontmatter: the child's frontmatter must carry that date verbatim under `observed`, or under `observed_at` (both names are accepted: akm writes `observed` and still reads `observed_at`; `observed` is read first). The four new case memories keep `observed_at`, because released akm reads only that name. A `scope` expectation gives the complete normalized tuple (`user`, `agent`, `run`, `channel`): the child must use canonical flat `scope_*` fields matching every key (compared as text, so an unquoted `77` matches `"77"`), including absent keys; a leftover nested `scope` fails this contract; `{}` expects an unscoped child. The observation-date and scope checks measure akm's deterministic copy of the parent's metadata, not the model; the `forbidden` unsafe-claim checks are the model-facing part. Prose mentioning the scope or the date cannot compensate for missing or broadened metadata. These checks use the saved derived file, so compatible older outputs can be rescored without recollection.

Terms match with case and spacing ignored; a one-word term ending in `y` also finds `ies`, `ied` and `ying`. The promotion checks read the model's plan, not the queue, since akm drops some promotions before queueing them.

| Metric | Meaning |
|---|---|
| `valid_output` | cases with a document of the right shape, of those that ran. A no-change is a valid decision but no document: it is in the denominator and not counted here, and shows in `by_process.<process>.outcomes["no-change"]` |
| `case_pass` | cases with the right shape and every check |
| `checks` | the mean share of each case's checks that held (a wrong shape earns none) |
| `median_seconds` | median time per case, which depends on the server |
| `by_process` | per process: `n`, `valid_output`, `passed`, `checks`, `outcomes`, `failed`. For memory inference, correct restraint is the `no-change` cases that passed, a false abstention is `failed["does not abstain"]`, and an unjustified child is `failed["decides no-change"]` |

One case is about 1.8 points of `case_pass`, 12.5 points of a process with 8 cases and 4.3 of memory inference, which has 23: compare by `checks` and rerun with `--repeat`.

## What the summary reports

`summary.json`: `metrics`, the counts run, scored and errored, `timeouts` (akm past `--timeout-ms`), `status` and `aborted_reason` (it aborts after five errored cases in a row), `served` (empty for remember-enrich and session-summary), `process`, the model, akm version and build, `config_patch`, `config` (endpoint written `<MODEL_BASE_URL>`), `engine`, `assets_sha256`, `seed`, `corpus_folder`, `concurrency`, `timeout_ms` and the `manifest`. `samples.jsonl`: one row per case with the outcome, the checks, and the raw output: the derived memory and akm's `inference` counters (`noChange`, `skippedNoFacts`, `writtenFacts`, `htmlErrorCount`), written memory, repair proposal, session asset, or plan and promotions. A run collected before version 0.3 has no `inference`: `scripts/rescore` scores its rows that hold a derived memory or an error, and refuses one with an unusable memory-inference row, which has to be collected again, since only akm's counters tell a no-change from an unusable reply.

`src/real.test.ts` runs every public case through a real akm against a scripted model, with `AKM_EVAL_REAL_AKM=1` and `AKM_BIN` set.

## Notes

- Four grounding controls cover nested and flat parent scope, an observation date held only in metadata, and a file `updated` date without an observation date. They need source context and scope inheritance (akm#1209, merged in AKM PR #1222). Older builds still run and expose these failures.
- The temporal controls check the child's frontmatter date (akm's copy) and keep unsafe claims out with finite forbidden phrases and valid-negation fixtures; a forbidden phrase matches whole words. They do not establish general semantic fidelity or deterministic generation provenance; `generated.at`, evidence projection and verification semantics remain owned by akm#1210. Today's child `updated` is a file write date and is not penalized.
- These processes are Evolving or Experimental in akm's stability policy.
- A session summary follows extract's own call, so `session-summary` needs two good replies; extract itself is scored by `evals/extract`.
- akm's error messages name its endpoint; the eval writes `<MODEL_BASE_URL>` in its place.

## Licence

MPL-2.0.
