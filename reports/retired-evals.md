# Retired evals

Twelve older evals and experiments were retired instead of moved into this repository. This page gives each one a short summary: what it asked, what it found, why it ended, and what here covers the question now.

The numbers are the ones the runs recorded, with the date of the run. They describe akm and the models of that day, not akm today. No run was repeated for this page, except the fragment contract (once, on akm 0.9.26). A figure that the saved reports did not state, such as the evolve tallies or the per-question AUCs, was worked out again from the saved files. A result that rests on private notes or queries is given as counts and scores only.

The old harness of this repository stays under the tag `legacy-2026-10`. The code of the others stays where it was: in the akm and akm-bench repositories, with the skills they test, or in the maintainer's own archive. Where nothing here covers a question, the entry says when to reopen it.

| Retired | Headline result | Covered now by |
|---|---|---|
| [tau-bench](#tau-bench) | One smoke task passed, 1 of 1, with akm off | Nothing |
| [Legacy Bun bench](#legacy-bun-bench) | 80.8% to 94.6% pass rate with akm only, and no control arm ever measured; 1 of 76 evolve reports found an improvement | `evals/agent-ab` and `benchmarks/terminal-bench`, for the utility question |
| [Fragment-context contract](#fragment-context-contract) | 14 of 14 checks on akm 0.9.15; 0 of 14 on akm 0.9.26 | Nothing |
| [Twin experiment](#twin-experiment) | Lift +0.35 on a 2-case suite; 0.000 on the others | `evals/nightly`, in part |
| [Monthly real-query verdict](#monthly-real-query-verdict) | Last verdict PASS on 2026-09-01, with an empty retrieval suite | `evals/retrieval --corpus own`, in part |
| [State analyzers](#state-analyzers) | No output kept; what they analysed was removed from akm | Nothing |
| [Dogfood](#dogfood) | Two experiments planned for 14 days each; the installed version drifted in 13 of 13 snapshots of the second | `evals/nightly`, in part |
| [Corrections backlog](#corrections-backlog) | 95 of 195 negative reasons named a real error; 67 of 70 filed fixes accepted | `evals/reflect`, `evals/consolidate` and `evals/nightly` check what it led to |
| [Decision judges](#decision-judges) | AUC 0.59 for a 2B decision model, near chance | `evals/judge-gate`, for generative judges |
| [Skill-pack evals](#skill-pack-evals) | 48 activation cases, 0 missed, 0 false; the runtime check never ran | Nothing |
| [Performance](#performance) | Speed depends on card, build and context depth: decode was 79% faster at 114k tokens between two llama.cpp builds | Nothing |
| [Routing](#routing) | No improve process could move to a smaller model; the 35B won the blind review 8 to 0 | `evals/bakeoff` and the process evals |

## tau-bench

- **Asked.** Can the old harness run the upstream tau-bench benchmark, where an agent follows a policy and calls tools for a simulated customer?
- **Ran.** One task of the retail environment, one trial, on 2026-05-06, with gpt-4o-mini as the agent and as the simulated user. The only config had akm off and no memory backend.
- **Found.** The task passed, 1 of 1, in 34 seconds. akm was not in the run, so the result says nothing about akm.
- **Retired because.** It was a smoke test of the harness, never a measurement. The upstream project calls the original tau-bench outdated. Its tasks give the agent every tool and rule up front, so akm has no part to play in them.
- **Now.** Nothing. Reopen if a benchmark of retrieval inside an agent loop is wanted: the knowledge-base domain of the newer tau3 release is the candidate we noted, and it has not been run. The old code is under the tag `legacy-2026-10`.

## Legacy Bun bench

- **Asked.** Three questions, on a first-party corpus of tasks run through opencode. Utility: does an agent with akm pass more tasks than one without it, or with synthetic notes? Attribute: how much does each asset add, found by leaving it out? Evolve: do feedback, then distill and reflect, raise the pass rate of later tasks?
- **Ran.** May 2026, on akm 0.7, mostly with local models of 9B to 35B parameters. The reference suite of 2026-05-06 had 26 tasks and 5 seeds on a local 9B model.
- **Found.** Utility: the akm arm passed 80.8%. The no-akm arm was not run, so this is not a lift, and no saved utility report has a measured no-akm arm. The best akm-only run, on a 35B model on 2026-05-10, passed 94.6%. Attribute: all five domain skills tied at +0.808. Each domain holds one skill, so this only restates the pass rate. Evolve: 100% before, 96% after, 32% with synthetic notes.
- **Also found.** Of 76 evolve reports from 6 to 10 May, one read as an improvement (44% to 100%, with no proposal accepted) and 75 as none. 29 sat at the ceiling (100% before and after), 22 at the floor (0%) and 24 in between. 20 had a proposal accepted, 1 to 3 each, and none of those moved significantly.
- **Retired because.** It is pinned to akm 0.7.1. Evolve calls `akm distill` and `akm reflect`, which akm 0.9 folded into `akm improve`, and the harness keeps the plugin out. Its CI passes only because the smoke test needs no model. The last real run was in May 2026. From late August 2026 the A/B ran in Harbor instead.
- **Now.** The utility question is asked twice, each time with and without the plugin: `evals/agent-ab` on 9 first-party tasks that the control fails, and `benchmarks/terminal-bench` on Terminal-Bench 2.1. Attribute and evolve: nothing. Reopen if per-asset attribution is wanted, or a test of whether improve raises later task results against a control. The code and the May reports stay in the akm-bench repository.

## Fragment-context contract

- **Asked.** Does the fragment context of akm 0.9.15 behave as designed? 14 checks, no model: opaque exact selectors, a lead that is safe to index plus the selected fragment, previous and next provenance, bounds in characters and tokens, reads of files changed after indexing, and no leak of fenced blocks, HTML comments or link targets.
- **Ran.** 2026-09-07, as the gate for the choice between akm 0.9.14 and 0.9.15.
- **Found.** akm 0.9.14 passed the 4 checks of old behaviour and had none of the 10 new features. akm 0.9.15, built from source and from the release package, passed 14 of 14. The gate passed.
- **Retired because.** akm 0.9.17 (2026-09-29) removed fragments from search hits, so the checks have nothing to find. Run against akm 0.9.26 on 2026-10-05 and again on 2026-10-06: 0 passed, 6 failed and 8 unsupported. It was a one-off gate for a decision that is made.
- **Now.** Nothing. Reopen if akm brings fragment context back.

## Twin experiment

- **Asked.** Does `akm improve` make a library better? The design froze one snapshot of an installation and made a control copy and a treatment copy. It ran improve on the treatment. It judged the result against limits set in advance: a minimum lift, no loss on protected cases, and budgets of tokens, calls and time. It also recorded which model endpoint answered.
- **Ran.** 23 and 24 July 2026, on akm 0.9.0-rc.10 and a local 9B model: a smoke suite of about 10 cases (3 runs of 2 samples each), a 2-case improve-effectiveness suite (4 samples) and one run on a copy of a real library.
- **Found.** Smoke suite: both arms scored 1.0 on every case that ran, so there was no lift to find. Two of the three runs were inconclusive (the model calls could not be confirmed, or the arms ran different cases) and one failed its 0.01 minimum. Improve-effectiveness: a lift of +0.35 in all 4 samples, above the 0.3 minimum. The target case went from 0.3 to 1.0 and the protected case stayed at 1.0. The real-library run passed with a lift of 0.000, and the treatment made no model calls.
- **Retired because.** It was used for two days. About 4,700 lines of snapshot and attestation code served runs of 2 to 4 samples, and it reaches into akm's internals. Since September the maintainer checks improve with a nightly run on a copy of a library, and reviews what it did.
- **Now.** In part. `evals/nightly` runs a whole improve night on a planted library and checks for harm. `evals/retrieval --corpus own` can score a library before and after a run. Nothing here compares a treatment with a control. Reopen if the lift of improve against a control is wanted again.

## Monthly real-query verdict

- **Asked.** Each month: is the proactive improve lane making the library better, or only using GPU time? It had three inputs. Retrieval quality on queries mined from the maintainer's own searches, against a baseline. The accept and revert rates of proactive and reactive proposals. The later feedback and retrievals of touched notes against untouched ones. The job posted PASS, FAIL or INCONCLUSIVE to a chat channel.
- **Ran.** The baseline on 2026-06-14: 150 mined queries, an overall score of 0.216. Monthly runs from 2026-07-01.
- **Found.** The mined queries were never committed (they are generated and git-ignored), so every monthly run from 2026-07-01 to 2026-10-01 had zero cases. The retrieval delta of the last verdict, 0.000, is the difference between two empty runs.
- **Last verdict.** 2026-09-01: PASS, keep the lane on. Proactive proposals were accepted 99.7% of the time (6,839 of 6,863 decided) against 73.0% for reactive ones (935 of 1,280), with no reversions. The treated group was 13 notes from a June pilot, with no feedback. On 2026-10-01 the job failed: no cases ran, and the verdict tool could not read the live index.
- **Retired because.** Its retrieval input was empty from July. Its labels came from which notes were used after a search, not from whether they answered it. The PASS rested on accept rates. And akm 0.9.21 (2026-10-01) stopped the proactive lane from rewriting assets: it only scores them now.
- **Now.** `evals/retrieval --corpus own` scores retrieval on a labelled set of your own queries, which is the part of the verdict worth keeping. The rest: nothing. Reopen if a kill criterion is wanted for a lane that rewrites assets.

## State analyzers

- **Asked.** Three read-only analyzers over a live library's databases. How much downstream use did memory inference and graph extraction earn (attribution rollup)? Does the memory index hold clusters that recur enough to justify a recombine pass (recombine analyzer)? What does retrieval do with graph extraction off against on (graph ablation)?
- **Built.** Between May and July 2026, in the akm repository.
- **Found.** No output from them was kept with the eval records; their reports print to the terminal by default. The questions were settled by akm itself. Its 0.9.17 changelog (2026-09-29) records that vector nearest-neighbour search beat the entity graph's related list by 0.157 precision at 5 (interval 0.051 to 0.260), and removed the graph.
- **Retired because.** What they analysed is gone. The ablation has refused to run since akm 0.9.17-alpha.9. The recombine pass was removed. The graph half of the attribution rollup has no data left. The attribution rollup and the recombine analyzer also read the databases of a live library, which this repository never does.
- **Now.** Nothing. Reopen if a question needs per-asset downstream use from a real library.

## Dogfood

- **Asked.** Does akm get measurably better when the maintainer uses a release every day for two weeks, against the two weeks before? The tool took daily snapshots of health, proposals, lint, and version and config drift.
- **Ran.** Two experiments: akm 0.9.1 (2026-08-18 to 2026-08-28) and akm 0.9.3 (2026-08-29 to 2026-09-12).
- **Found.** akm 0.9.1: 10 of 14 planned snapshots, no version drift, one config; pending proposals 0 to 3; lint flags up to 7. akm 0.9.3: 13 of 14 snapshots; the installed version drifted from 0.9.3 in all 13; the improve config took 5 forms; pending proposals 13 to 18; lint flags up to 80; the median improve run took 687 s against 88 s. Neither run recorded a manual observation, and both reports say their flags are not an assessment of usefulness.
- **Retired because.** Version, config and tasks changed during the windows and there was no control, so no change could be tied to akm. Both experiments were completed, and the scheduled tasks that ran them were removed on 2026-09-28.
- **Now.** `evals/nightly` is the controlled form: one night, a fixed library and config, and the akm version recorded. Nothing here is longitudinal. Reopen if a measure of a real library over weeks is wanted, with the version and config pinned.

## Corrections backlog

- **Asked.** Negative feedback on a note carries a reason. How many reasons name an error that can be checked? Can each be fixed against a primary source? Why were improve's proposals on those notes rejected? The study also specified the exact-fix feedback that akm 0.9.26 ships.
- **Ran.** 5 September to 5 October 2026: 195 negative reasons on 164 notes. Claude subagents reviewed them against a written brief, and the counts were made under one rubric. Every fix was dry-run through akm's own checks, and 49 of the 71 fixes were checked against a repository at a tag, branch or commit.
- **Found, on feedback.** 95 reasons named a real error: 71 fixed, 1 in a read-only copy, 20 already fixed, 3 overtaken. 100 named no error in the note: 89 said the note did not fit the task, 8 were akm failures, 3 could not be checked. None was wrong outright and 8 got a detail wrong.
- **Found, on fixes.** The 71 fixes held 147 replacements: 48 marked an old note as historical, 21 corrected text, 2 removed text that an earlier improve run had added. 70 fixes were filed as proposals and 67 accepted. 40 history marks (outdated or superseded) were accepted with akm 0.9.26.
- **Found, on improve.** Of its proposals on these notes, 39 of 40 from reflect were rejected, 9 of 9 from distill, 1 of 1 from extract and 2 of 2 promotions. The 39 rejected reflect edits were all churn: 38 touched the body and 23 had nothing to fix. Of the 9 distill lessons, 5 claimed more than their source and 4 filed a dated status as a lesson.
- **Found, on consolidate.** The old pair judge proposed 385 retirements: 232 were accepted and 153 refused. In 107 of the 153 the retired note held facts that its successor lacked, in 44 the wrong note of the pair was retired, and 2 had changed. That judge was right 61% of the time, and the 0.9.26 judge 91% on the same pairs held out.
- **Retired because.** A one-off campaign, finished on 2026-10-05. Its findings went into akm: reflect edits frontmatter only (0.9.25), and, in 0.9.26, exact-fix feedback, a pair judge that never retires a note with a claim of its own, distill lessons that wait for review, and feedback hints that say what negative feedback is for.
- **Now.** `evals/reflect`, `evals/consolidate` and the `fix` item of `evals/nightly` check those shipped changes. Nothing reruns the study itself, and its scripts write to a live library, so they stay out.

## Decision judges

- **Asked.** Can a small model that answers typed questions, not free text, replace the generative quality judge that gates improve proposals?
- **Ran.** 2026-09-22: localjev, a third-party library that turns rubric questions into scores, against the generative judge on the same local models. 24 planted lessons, 12 copies of their source and 12 that extend it, on a 35B and a 4B model. 2026-10-01: Intern-Decision-2B, a 2B text-only decision model, asked three questions (is the edit needed, does it keep the facts, is it supported) of 88 reflect proposals from the judge-gate set (16 good, 72 bad) and 2 distill lessons.
- **Found.** Intern-Decision-2B: AUC 0.59 on its combined accept score, near chance. The three questions alone gave 0.41, 0.47 and 0.53. localjev: on the 35B both methods refused all 12 copies, and typed decisions passed 7 of the 12 extensions against 4 for the generative judge. On the 4B the generative judge passed all 24 lessons, and typed decisions passed 6 and sent 16 to review. On the 88 reflect cases no panel of the generative judges tried beat a local 27B model alone.
- **Retired because.** A negative result. The localjev scripts were never committed, and the decision service is not wired into anything.
- **Now.** `evals/judge-gate` measures any chat model as the judge, on 106 cases (28 good). It cannot test a model that is not a chat endpoint. Reopen if akm adds a non-generative decision engine; a feature request for one is open.

## Skill-pack evals

- **Asked.** Do agent skills activate on the right requests, stay quiet on near misses and keep to their safety rules? These test skill packs, and were written beside the skills.
- **Ran.** The verification of a technical-debt skill pack on 2026-08-06: 9 required checks, one of them 48 deterministic activation cases over 12 skills. Other skills carry prompt sets of their own, such as 10 prompts for a memory-tidying skill.
- **Found.** All 9 required checks passed. The 48 cases had 0 missed and 0 false activations, which shows that the cases are consistent, not that an agent follows the skills. The runtime check, which needs recorded agent runs, never ran.
- **Retired because.** They test skills, not akm, and nothing cites them. They belong with their skills.
- **Now.** Nothing, on purpose. `benchmarks/skillret` measures whether akm ranks the right skill first, and `evals/agent-ab` whether the plugin changes task completion. Whether a skill triggers in an agent is not akm's question.

## Performance

- **Asked.** How fast can the maintainer's GPUs serve the models behind akm's jobs, and which engine, build and settings are fastest? Prefill and decode speed, expert placement for mixture-of-experts models, KV cache types, GPU power management.
- **Ran.** July 2026: vLLM and llama.cpp sweeps of 9B, 27B and 35B models on two consumer GPUs. September 2026: depth sweeps, ik_llama.cpp and sparse-attention trials, power-management pins.
- **Found, July.** Median end-to-end speed on 80-token replies: a 9B model 39 tokens/s on one GPU and about 60 on two; a 27B model 24 on two; a 35B mixture-of-experts model 14 on one and 60 to 70 on two.
- **Found, September.** 27B at 4-bit: between two llama.cpp builds that differ mainly by one upstream attention change, decode speed rose 7.5% at 4.6k tokens of context, 44% at 36.6k, 65% at 73k and 79% at 114k. Prefill did not change. That is not an isolated test of the change, and the first check missed the gain because the eval items were 1k to 3k tokens long. ik_llama.cpp matched mainline llama.cpp on one mixture-of-experts model for one stream (18.5 against 19.0 tokens/s) and was slower over four streams (10.3 against 17.1).
- **Retired because.** It is not an akm eval. The numbers are bound to one machine and one build, the July sweeps were superseded by the September bake-off, and each trial reached its conclusion. Speed also says little about quality: one request default, the repeat penalty, moved distill grounding by more than 20 points between two servers with identical weights.
- **Now.** Nothing, on purpose. `evals/bakeoff` scores quality and records `median_seconds`, which depends on the server, and it dropped the token-rate figures. Reopen if a job needs a latency budget.

## Routing

- **Asked.** Can any `akm improve` process move from the main GPU's 35B mixture-of-experts model to an idle second GPU's 9B model, to take load off the main one, without losing accuracy?
- **Ran.** 2026-09-24, read-only on copies of the state and index databases, with akm's own prompts and parsers from a 0.9.17 branch: graph extraction on 27 files, a consolidate dry run on 105 memories, the triage judgment, and a blind pairwise review of 12 documents (labels randomised, key withheld).
- **Found.** No process moved. Graph extraction: the 9B was faster (225 s against 338 s) and found fewer entities and relations (261 and 178 against 361 and 244). In the blind review the 35B was better on 8 documents, the 9B on 0, and 4 tied. The 9B had 24 unsupported relations against 12, and missed 40 salient entities against 24.
- **The automatic checks disagreed with the review.** String grounding scored the 9B higher (99.6% and 97.8% against 96.7% and 95.5%), and the entity lists of the two models agreed only 0.29 (Jaccard).
- **Other processes.** Consolidate: the 9B proposed 13 promotions against 57, with 2 malformed refs. Triage: 1 of 31 pending proposals reaches the judge, so there was nothing to move. The reflect and distill judges could not be routed.
- **Also found.** The same harness compared two graph output formats on 30 files. Compact triples cut completion tokens by 36% (22,817 to 14,533) and wall time by 35%, with 0 failures, and a blind review of 12 documents was about even (5 documents won against 4).
- **Retired because.** Graph extraction and metadata enrichment were removed in akm 0.9.17 (2026-09-29), so the graph harnesses target deleted code, and the triage harness imports a drain policy that 0.9.17 deleted. The lesson that outlives it: grounding and agreement scores are not a safe test for swapping a model, and a blind pairwise review is.
- **Now.** `evals/bakeoff` measures which model runs each akm job best, and the process evals (`evals/judge-gate`, `evals/consolidate`, `evals/reflect`, `evals/distill`, `evals/extract`) each run against the endpoint you want to try. Nothing here compares two engines blind on the same documents. Reopen if a process with free-text output, as graph extraction was, is routed again.

## Licence

MPL-2.0, like the rest of this repository. See `../LICENSE`.
