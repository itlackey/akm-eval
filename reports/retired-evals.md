# Retired evals

Twelve older evals and experiments were retired instead of moved into this repository, and bakeoff gave up most of its jobs when it was rebuilt to drive akm. The numbers are those the runs recorded, on the date given: they describe akm and the models of that day. The old harness stays under the tag `legacy-2026-10`. The toolkit that lived in akm as `scripts/akm-eval` is kept, to read and not to run, in [`retired/akm-scripts-akm-eval/`](../retired/akm-scripts-akm-eval/README.md).

| Retired | Headline result | Covered now by |
|---|---|---|
| [tau-bench](#tau-bench) | One smoke task passed, 1 of 1, with akm off | Nothing |
| [Legacy Bun bench](#legacy-bun-bench) | 80.8% to 94.6% pass rate with akm only, and no control arm ever measured | `evals/agent-ab`, `benchmarks/terminal-bench` |
| [Fragment-context contract](#fragment-context-contract) | 14 of 14 checks on akm 0.9.15; 0 of 14 on 0.9.26 | Nothing |
| [Twin experiment](#twin-experiment) | Lift +0.35 on a 2-case suite; 0.000 on the others | `evals/nightly`, in part |
| [Monthly real-query verdict](#monthly-real-query-verdict) | Last verdict PASS on 2026-09-01, with an empty retrieval suite | `evals/retrieval --cases DIR`, in part |
| [State analyzers](#state-analyzers) | No output kept; what they analysed was removed from akm | Nothing |
| [Dogfood](#dogfood) | The installed version drifted in 13 of 13 snapshots | `evals/nightly`, in part |
| [Corrections backlog](#corrections-backlog) | 95 of 195 negative reasons named a real error; 67 of 70 filed fixes accepted | `evals/reflect`, `evals/consolidate`, `evals/nightly` |
| [Decision judges](#decision-judges) | AUC 0.59 for a 2B decision model, near chance | `evals/judge-gate` |
| [Skill-pack evals](#skill-pack-evals) | 48 activation cases, 0 missed, 0 false; the runtime check never ran | Nothing |
| [Performance](#performance) | Decode 79% faster at 114k tokens between two llama.cpp builds | Nothing |
| [Routing](#routing) | No improve process could move to a smaller model; the 35B won the blind review 8 to 0 | The process evals and `evals/bakeoff` |
| [Bakeoff's frozen-prompt jobs](#bakeoffs-frozen-prompt-jobs) | 105 of 120 cases scored a model on a copy of akm's prompts | The process evals; `evals/bakeoff` for the rest |

## tau-bench

One retail task, 2026-05-06, gpt-4o-mini, akm off: passed. A smoke test of the old harness, never a measurement; its tasks give the agent every tool up front, so akm has no part. Reopen for retrieval inside an agent loop (the knowledge-base domain of tau3 is the candidate).

## Legacy Bun bench

Asked whether an agent with akm passes more tasks (utility), what each asset adds (attribute), and whether feedback plus distill and reflect raise later pass rates (evolve). May 2026, akm 0.7. The akm arm passed 80.8% (94.6% on a 35B model), but the no-akm arm was never run. Of 76 evolve reports, one read as an improvement. Retired because it is pinned to akm 0.7.1, whose commands akm 0.9 replaced. The utility question is now `evals/agent-ab` and `benchmarks/terminal-bench`. The code stays in the akm-bench repository.

## Fragment-context contract

14 no-model checks of akm 0.9.15's fragment context, the gate for choosing 0.9.15 over 0.9.14 (2026-09-07): 14 of 14 passed. akm 0.9.17 removed fragments from search hits, and 0.9.26 passes none. Reopen if fragments come back.

## Twin experiment

Ran improve on a treatment copy of a library against a control copy, with limits set in advance. July 2026, akm 0.9.0-rc.10, a local 9B model: a lift of +0.35 on a 2-case suite, none elsewhere. About 4,700 lines of snapshot code for runs of 2 to 4 samples, used for two days. `evals/nightly` checks a whole improve night for harm; nothing compares a treatment with a control.

## Monthly real-query verdict

A monthly PASS/FAIL on whether the proactive improve lane helped, from mined queries, accept rates and later use. The mined queries were never committed, so every run from July had zero cases; the last PASS (2026-09-01) rested on accept rates (99.7% proactive, 73.0% reactive). akm 0.9.21 stopped the lane from rewriting assets. `evals/retrieval --cases DIR` scores retrieval on a labelled set of your own.

## State analyzers

Three read-only analyzers of a live library's databases (attribution, recombine, graph ablation). No output was kept, and akm 0.9.17 removed the graph and the recombine pass they analysed. Nothing replaces them.

## Dogfood

Daily snapshots while the maintainer used akm 0.9.1 and 0.9.3 for two weeks each (August to September 2026). Version and config drifted (13 of 13 snapshots on 0.9.3) and there was no control, so no change could be tied to akm. `evals/nightly` is the controlled form.

## Corrections backlog

A study of 195 negative feedback reasons on 164 notes (September to October 2026). 95 named a real error; 71 were fixed, and 67 of 70 filed fixes were accepted. Of improve's proposals on these notes, 39 of 40 reflect edits were rejected (all churn) and 9 of 9 distill lessons; the old consolidate pair judge was right 61% of the time, the 0.9.26 judge 91%. Its findings went into akm 0.9.25 and 0.9.26 (frontmatter-only reflect, exact-fix feedback, a stricter pair judge, lessons that wait for review), which `evals/reflect`, `evals/consolidate` and `evals/nightly` check.

## Decision judges

Could a small model answering typed questions replace the generative quality judge? Intern-Decision-2B scored AUC 0.59 on 88 reflect proposals, near chance; localjev was mixed. A negative result. `evals/judge-gate` measures any chat model as the judge. Reopen if akm adds a non-generative decision engine.

## Skill-pack evals

Activation checks written beside agent skills: 48 cases, 0 missed, 0 false; the runtime check never ran. They test skills, not akm, and belong with them. `benchmarks/skillret` measures whether akm ranks the right skill first.

## Performance

GPU throughput sweeps (vLLM, llama.cpp) for the models behind akm's jobs, July and September 2026. Not an akm eval, and bound to one machine. `evals/bakeoff` records `median_seconds` per job.

## Routing

Could an improve process move from a 35B model to an idle 9B one (2026-09-24)? None could: the 35B won a blind review 8 to 0, though string-grounding scores favoured the 9B. The graph extraction it tested was removed in akm 0.9.17. The lesson that outlives it: grounding and agreement scores are not a safe test for swapping a model; a blind pairwise review is.

## Bakeoff's frozen-prompt jobs

The old bakeoff scored 120 cases in 13 jobs on a frozen copy of akm's prompts ("0.9.15-style") and never ran akm. Issue #46 rebuilt it to drive akm through `lib/akm` and retired every job another eval measures through akm, or that akm no longer asks a model for (checked against akm-cli 0.9.26 on 2026-10-12).

- **Stays in `evals/bakeoff`:** `memory-inference` (4 cases), `remember-enrich` (4), `schema-repair` (4), `session-summary` (1) and `consolidate-promote` (2).
- **Measured now elsewhere:** consolidation relations (`evals/consolidate`), lessons and their gate (`evals/distill`), session extraction (`evals/extract`), reflect proposals (`evals/reflect`), the proposal quality gate (`evals/judge-gate`), triage of promotions (`evals/promotion`).
- **Gone with akm:** graph extraction and metadata enhancement (removed in 0.9.17), whole-document merges and grounded compression (no akm job).
- **Gaps:** nothing measures the drain's judgment on an update to an existing note, a promotion pass over memories already queued, or a summary of more than one session.

No earlier bakeoff result carries over.
