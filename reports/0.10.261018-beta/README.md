# akm 0.10.261018-beta, 35B, semantic, full

Every eval but LongMemEval and Terminal-Bench, run once on 2026-10-29 with akm 0.10.261018-beta (npm `next`, the last
0.10.0 beta before the stable cut), `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public
corpora, temperature 0 and thinking off, one eval at a time. It is the same set, run the same way, as the
[0.9.32 set](../0.9.32/) (2026-10-22), which is the first column below, and as the
[0.10.261012-beta round](../0.10.261012-beta/) (2026-10-23), the last published 0.10 round and the second column. Their
settings are those of the [0.10.261011-beta round](../0.10.261011-beta/): default concurrency (1; judge-gate 2) and default
timeouts for the process evals, and for agent-ab 6 tasks, 3 attempts per arm, 4 trials at a time, with
`akm-cli@0.10.261018-beta` and the plugin pinned at 0.10.261002-beta (the plugin carries its own akm-cli 0.10.261003-beta; the
akm that the agent shells out to is the one under test). The model's context and output limits (32768 and 4096) were set for
agent-ab. All 13 summaries below are `complete` with no errored case and no failed model call.

The collector is akm-eval at `556b869` (clean tree; the summaries read `556b869`). Between `307e636`, the commit of the 0.9.32
set and of the 0.10.261012-beta round, and `556b869` only a CI workflow and a ledger browser check changed: no eval, `lib/`
or benchmark file differs, so the published 0.9.32 and 0.10.261012-beta summaries are compared as they are and were not run
again. The process evals ran against `akm-cli@0.10.261018-beta` installed in a temporary npm prefix under Node 24 and found
through `PATH` (the summaries' `akm_bin` reads `akm`, as in the earlier 0.10 rounds); agent-ab installed the same release in
each container. Two things about the environment differ from the earlier rounds (a shim that seeds akm's ONNX Runtime, and where the sandboxes live) and are described under "Environment" below;
neither changes what an eval asks akm or how it scores the answer.

## What changed in akm since 0.10.261012-beta

From the CHANGELOG of the package (0.10.261013 to 0.10.261018). Only the entries that reach an eval or its set-up are listed.

| PR | change |
|---|---|
| #1244 | connections and harnesses replace `engines` (0.10.261014). The collector still writes the old `engines`/`defaults` form; akm reads it as connections and warns, and the converted connection keeps `temperature: 0` and thinking off (checked with `akm config list` on the collector's config; request bodies were not captured). The model's reachability probe is no longer sent, to judge by the call counts below |
| #1254, #1255, #1256, #1257 | the local embedder's ONNX Runtime is no longer installed with the package: it is fetched once from the npm registry into `<cache dir>/onnxruntime/`, the package has no install script, and local embeddings are offered on Linux x64 (glibc) and Apple-silicon macOS only (0.10.261015). The vectors are unchanged |
| #1260 | `akm search` keeps the identifiers of fenced code (names, flags, config keys, paths) in the `content` it searches and still drops their literal values (0.10.261017) |
| #1259, #1266, #1265 | `akm show` returns a Markdown outline; a lock around the runtime fetches; health advisories. No eval measures them |
| (0.10.261018) | fixes to akm's own agent runtime (a repeated-tool-call nudge, `PWD`, the OpenCode 2.2.0 runtime) and `akm migrate apply` keeping agent engines. No eval here runs that runtime |

## Next to 0.9.32 and 0.10.261012-beta

One run per side; `scripts/compare/run` shows each pair in full. The 0.9.32 column is the [0.9.32 set](../0.9.32/) and the
0.10.261012-beta column is its [published round](../0.10.261012-beta/); all three were collected with the same eval versions
(bakeoff 0.4, reflect 0.4, retrieval 0.3, nightly collector 0.3 and scorer 0.4). Several settings differ (akm, date, lab
route), so no difference below isolates one cause, and one run per side is one observation.

| eval | headline | 0.9.32 | 0.10.261012-beta | 0.10.261018-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes | 36/40 | 36/40 | 36/40 |
| distill | good lessons (wrong lessons) | 11/40 (0/16) | 25/40 (0/16) | 24/40 (0/16) |
| extract | useful memories | 35/40 | 34/40 | 35/40 |
| judge-gate | approved revisions that were good | 16/17 | 16/17 | 15/16 |
| bakeoff 0.4 | cases passed | 35/55 | 42/55 | 43/55 |
| consolidate | safe retirements found (unsafe) | 34/40 (1) | 37/40 (0) | 36/40 (0) |
| consolidate `--pool` | safe retirements found | 18/19 | 19/19 | 18/19 |
| promotion | accepted proposals that were good | 34/40 | 35/40 | 35/40 |
| nightly | items handled right | 28/35 | 31/35 | 31/35 |
| retrieval, books / library | semantic search nDCG@10 | 0.909 / 0.826 | 0.911 / 0.826 | 0.911 / **0.829** |
| retrieval, books / library | keyword search nDCG@10 | 0.828 / 0.757 | 0.836 / 0.757 | 0.836 / **0.775** |
| skillret | keyword NDCG@10 | 50.47 | 50.47 | **48.19** |
| skillret | semantic NDCG@10 | 58.00 | 58.00 | **57.24** |
| agent-ab | pass rate, akm / control | 9/18 / 1/18 | 8/18 / 1/18 | 8/18 / 2/18 |

Wall time, from each summary's `wall_seconds` (0.10.261012-beta in brackets): reflect 331 s (293), distill 683 s (711),
extract 426 s (438), judge-gate 270 s (276), bakeoff 252 s (254), consolidate 392 s (368), consolidate `--pool` 96 s (95),
promotion 191 s (186), nightly 129 s (129), retrieval 106 s (100) for books and 284 s (268) for library, SkillRet 1,979 s
(1,920; queries 1,400 s, cold semantic index 557 s, keyword index 21 s), agent-ab 1,407 s (905). The round took 1 h 49 min.
Both retrieval indexes and the SkillRet index were built cold (books 4.7 s, library 20.5 s, SkillRet 557 s), as in the
earlier rounds. Reflect is 13 percent slower than in the 0.10.261012-beta round and consolidate 7 percent, which fits (but was not isolated from) the
extra process start of the shim described below; the other process evals are within 4 percent.

| eval | folder |
|---|---|
| reflect | [reflect/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](reflect/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| distill | [distill/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](distill/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| extract | [extract/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](extract/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| judge-gate | [judge-gate/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](judge-gate/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| bakeoff (0.4) | [bakeoff/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](bakeoff/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| consolidate | [consolidate/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](consolidate/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| consolidate `--pool` | [consolidate/2026-10-29-0.10.261018-beta-35b-semantic-pool-20261029](consolidate/2026-10-29-0.10.261018-beta-35b-semantic-pool-20261029) |
| promotion | [promotion/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](promotion/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| nightly | [nightly/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](nightly/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| retrieval | [books](retrieval/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029-books), [library](retrieval/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029-library) |
| skillret | [skillret/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](skillret/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |
| agent-ab | [agent-ab/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029](agent-ab/2026-10-29-0.10.261018-beta-35b-semantic-full-20261029) |

## What differs from the earlier rounds, and what does not isolate a cause

Retrieval and SkillRet call no model and search is deterministic, so their differences are the build's, not run-to-run
variation. Everything else is one run of a model route that is not deterministic over time: identical requests have given
different texts minutes apart on this server, so a one- to four-case move in a model-driven eval is inside what the earlier
rounds showed between runs of the same settings, and none of the moves below was run again.

- **SkillRet moved, and it is the one difference that is not noise.** Keyword NDCG@10 is 48.19 against 50.47 in every
  published round (0.9.32 and 0.10.261003-beta to 0.10.261012-beta, identical to the second decimal), semantic 57.24 against
  58.00. Every keyword metric is lower, by 1.8 to 2.9 points (NDCG@5 45.63 against 47.95, Recall@10 56.51 against 58.38,
  Completeness@10 41.17 against 43.21, MAP@10 41.13 against 43.44) and every semantic one by 0.5 to 0.9 points, for 1-, 2- and
  3-skill queries alike (keyword NDCG@10 53.86 against 55.42, 44.46 against 47.16, 37.57 against 41.33). The curate check still
  returns search's ranking on 200 of 200 queries on both indexes, with no errored query. The one CHANGELOG entry in this range
  that changes the text akm searches is #1260 (fenced-code identifiers now count), which would add terms to every skill that
  holds code; this run did not separate that from the other changes, and no run of another build was made.
- **The library retrieval collection moved up, the books collection did not.** Keyword nDCG@10 0.775 against 0.757, semantic
  0.829 against 0.826, success@5 for semantic search 99.0% against 96.0%; the books collection is identical to
  0.10.261012-beta on every search and curate metric. That is the direction and the place #1260 states for itself (the library
  set holds code, the prose-only books set does not). The share of the library's top 10 that has a relevance judgment fell
  from 100% to 95.5% (keyword) and 95.8% (semantic): some results that are new in the top 10 were never graded, and
  the evaluator counts an ungraded result as not relevant, so the library figures read low by an unknown amount. Curate
  abstains on 5 of the library's 25 non-task inputs, as in 0.10.261012-beta (1 of 25 on 0.9.32).
- **Bakeoff: two protected-memory checks fail in both consolidate-promote pool cases, and that is an accepted 0.10 behaviour
  change, not a regression.** The check "leaves protected memories/operator-preference untouched" fails in
  `consolidate-memory-pool` and `prod-consolidate-full-pool` on this build, as it does in every published 0.10 35B round from
  0.10.261005-beta on; 0.9.32 passes it in both cases. The 0.10 plan includes `memories/operator-preference`, a
  `captureMode: hot` memory. akm PR #1170 (the policy batch, commit `4438ce2c3`, 2026-10-11; CHANGELOG 0.10.26101101,
  "`captureMode: hot` memories are consolidated like any other memory") removed the hot-memory protections on purpose, and
  the two cases still encode 0.9's hot-memory rule. The owner has ruled it accepted; the cases are unchanged in this results
  PR, and an update of their expectations belongs in a separate akm-eval change. The other bakeoff moves are within a
  run's spread: 43/55 against 42, five cases changed sides (`infer-checkpoint-memory` and `prod-session-summary` now fail;
  `infer-short-format-command`, `enrich-translation-keys-memory` and `orders-dedupe-session-summary` now pass).
- **Distill keeps the gain #1241 made in 0.10.261012-beta.** 24 of 40 good lessons with no wrong lesson, against 25 (0.10.261012-beta)
  and 11 (0.9.32): lesson-worthy 18/23, over-claim 6/17, lesson updates still 0/40 right. Eleven of 96 verdicts differ from 0.10.261012-beta, mostly wording: four lessons that were
  good are now bad because a forbidden phrase appears in the text (`lesson-03` "vendors reject", `lesson-05`, `lesson-10`
  "full path", `lesson-23`), and `lesson-04`, `lesson-17` and `claim-17` went the other way. The earlier rounds showed 4 to 19 of
  96 verdicts changing between runs and builds.
- **Bakeoff 0.4 on three builds.** The same breakdown as in the [0.10.261011-beta report](../0.10.261011-beta/#bakeoff-04-on-three-akm-builds):

  | | 0.9.32 | 0.10.261012-beta | 0.10.261018-beta |
  |---|---:|---:|---:|
  | cases passed, the 51 shared with 0.3 / all 55 | 34 / 35 | 38 / 42 | 39 / 43 |
  | memory-inference passed, the 19 shared / all 23 | 12 / 13 | 17 / 21 | 17 / 21 |
  | remember-enrich / schema-repair / session-summary / consolidate-promote passed (of 8) | 7 / 6 / 3 / 6 | 7 / 6 / 2 / 6 | 8 / 6 / 2 / 6 |
  | memory-inference outcomes on all 23 (output / no-change / unusable) | 23 / 0 / 0 | 20 / 3 / 0 | 19 / 4 / 0 |
  | correct restraint (no child needed, none written) | 0 of 5 | 3 of 5 | 4 of 5 |
  | unjustified child (no child needed, one written) | 5 of 5 | 2 of 5 | 1 of 5 |
  | false abstention (child needed, decided no-change) | 0 of 14 | 0 of 14 | 0 of 14 |
  | the four grounding controls passed | 1 of 4 | 4 of 4 | 4 of 4 |
  | valid output | 55/55 | 51/55 | 51/55 |

  The changes bakeoff 0.4 measures (the no-change decision, source context, parent scope and observation date in the child)
  exist in both 0.10 builds and not in 0.9.32, which is why 0.9.32 cannot pass them. Model calls fall from 114 to 74
  (0.9.32: 108) and the means per call rise (prompt tokens 484 to 725), which is the effect of the missing reachability probe
  and not a change in the work done.
- **Within the earlier spread.** reflect 36/40 as in every round (the controls 31/40 against 32 to 34 before; five of
  80 outcomes changed sides), extract 35/40 (34 to 36; planted instructions 3/4; four of 64 changed), judge-gate (15 of 40
  good revisions passed, and one bad churn revision of 95, no harmful one of 67, exactly as 0.10.261012-beta; 14 of 135 outcomes moved
  between pass, review and reject), consolidate 36/40 with no unsafe retirement (five of 80 judgments changed) and `--pool`
  18/19 (one of 47 changed), promotion 35/40 with 5 of 40 bad proposals accepted (two of 80 changed), nightly 31/35 with no
  harm (two of 35 items changed: `asset-01` now handled, `silent-description-missing-02` not).
- **Agent A/B.** The akm arm passed 8 of 18 trials and the control 2 of 18 (+33.3 points, interval 5.6 to 61.1 over 6 tasks);
  the akm arm beat the control on 4 of 6 tasks and tied on 2 (sign test over the 4 tasks where the arms differ: p = 0.125). It called
  akm in 8 of 18 trials (`akm_curate` 6, `akm_show` 10, shell 2) and passed 7 of them; of the 10 without a call it passed 1. Per task
  the akm arm passed `drillbit--fix-runbook-train` 2/3, `drillbit--scale-replicas-train` 3/3, `inkwell--new-service-train` 2/3,
  `inkwell--new-service-scaled-train` 1/3 and the other two 0/3; the control passed `drillbit--scale-replicas-train` 2/3 and
  nothing else. The akm arm's 8 of 18 equals 0.10.261012-beta's and is inside the 8 to 13 of 18 that the arm gave over five
  attempts of 0.10.261011-beta and 0.10.261012-beta; the 0.9.32 set had 9. On `drillbit--fix-runbook-train` one control trial ran out of
  time (verified, reward 0) and one trial of each arm ended with opencode exiting non-zero after its last step: Harbor recorded
  `NonZeroAgentExitCodeError`, the verifier scored the trials (reward 0) and the summary counts them as scored, not errored.
  No trial errored in setup, and no setup was retried.
- **Next to 0.9.32.** The differences that persist through the 0.10 rounds persist here: distill (11 to 24 good lessons),
  bakeoff (35 to 43 cases, the no-change and grounding cases), nightly's `silent` items (4/6 against 0/6, since 0.9.32 has no
  cached no-change) and consolidate (36/40 and no unsafe retirement against 34/40 and one). reflect, extract, promotion and
  the agent-ab pass rate are where they were.

## Environment

- **The ONNX Runtime is copied into each sandbox by a shim.** From 0.10.261015 akm fetches its ONNX Runtime (about 36 MB kept,
  from the npm registry) into `<cache dir>/onnxruntime/` on the first local embedding, and the harness gives every sandbox its
  own cache dir, so every case of a process eval would have fetched it again. A shim named `akm`, first on `PATH`, copies one
  fetch that akm had made and verified into the sandbox's cache dir when it is missing (the offline procedure of akm's
  configuration reference) and then runs akm 0.10.261018-beta unchanged. Embeddings are produced by akm's own runtime either way;
  the model files come from the same shared folder as before. The agent-ab containers fetched the runtime themselves.
- **The sandboxes were kept outside the repository.** `TMPDIR` pointed at a folder that is not inside a git work tree: with
  the sandbox inside the repository's ignored `.cache/`, akm 0.10.261018-beta indexed 0 assets of the library for keyword search
  (it respects the enclosing repository's `.gitignore`), which retrieval caught before its first query.
- **Retrieval's semantic index and SkillRet's were built cold** in a fresh checkout: the 154 MB embedding model was copied from
  the main checkout and SkillRet fetched its pinned dataset (revision `a050ad233a50`) as the eval does.

## Caveats

- One run per eval. The model route is not deterministic over time, so each model-driven figure is one observation; the
  single-run moves above are described with their per-case detail in `samples.jsonl` and were not confirmed by a second run.
- The shim adds a process start to every akm command, and the first command of each sandbox copies 36 MB, so wall times
  are slightly higher than an installed akm would give; the cold-index timings match the earlier rounds.
- The collector writes the retired `engines`/`defaults` config, which this build reads with a warning; `model_calls` therefore
  differ from the 0.10.261012-beta round for distill (297 to 203) and bakeoff (114 to 74), and the counts and token means
  do not compare across that boundary.
- Retrieval's library judgments cover 95.5% (keyword) and 95.8% (semantic) of the top 10, against 100% before.
