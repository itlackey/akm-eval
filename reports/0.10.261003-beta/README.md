# Bifrost runs on AKM 0.10.261003-beta

These are public cases collected by the real AKM CLI and real models, on 2026-10-12–13 (UTC). The 50 published runs contain 6,820 sample rows. `summary.json` and `samples.jsonl` are copied unchanged from completed runs. The [index](../README.md) lists every published folder. Aborted runs are kept locally and are described below rather than presented as baselines.

The model-driven evals use the existing Bifrost alias `chat/qwen3.8-27b`. It is a gateway pool; these results do not claim one fixed quantization or inference host. Larger model pilots use `freellm/gpt-oss:120b` through the same gateway. The existing Qwen judge is reused. Retrieval and SkillRet use AKM's pinned built-in embedding model locally; their runs call no model service. Consolidate and nightly use their default deterministic word-hash embedder to select candidates, with Qwen making the model judgments.

The initial source is the readiness change in [PR #79](https://github.com/itlackey/akm-eval/pull/79), commit `894bfff`, based on v0.3. Some runs began before the patch was committed and record `dd34863-dirty`. The recovery batches used the released v0.4 commit `ce17f0a`, including the nightly and reflect indexed-ref repair in [PR #81](https://github.com/itlackey/akm-eval/pull/81). Their manifests and `harness_sha256` record the actual code and inputs. Public artifacts and documentation added afterward do not change those code digests. The Docker arm uses plugin `0.10.261002-beta`, whose dependency is the requested CLI, with the committed dependency locks. The original pinned plugin failed its first pilot because it called `--shape` on the 0.10 CLI; that result is not a performance baseline.

## Reproduce

The recorded matrix experiments and their reproduction script are historical.
Run that script from the v0.4 checkout to reproduce the old orchestration.
On current main, use direct eval commands from the [current run guide](../../README.md#run-save-compare).
All published summaries and samples below remain unchanged.


Install Bun 1.4.2 and `akm-cli@0.10.261003-beta`. Set `MODEL_BASE_URL` to your Bifrost `/v1` endpoint and `JUDGE_BASE_URL` to the same endpoint. Set credentials in your local environment only if your gateway requires them. Docker and uv are needed for the agent benchmarks. Dataset files and model caches are fetched at runtime and are not published here.

```sh
bash reports/0.10.261003-beta/reproduction/run-public.sh
```

That recipe runs the complete suites sequentially. Use v0.4 or later for the indexed-ref repair in nightly and reflect. Start each larger model benchmark with `--limit` to verify your gateway quota before launching it. `local` in the Harbor command is a dummy value because Harbor requires a nonempty key even for a keyless gateway. LongMemEval supports `--resume DIR`; it retries the questions whose arms errored, provided the source, model, settings and questions still match.

The full GPT-120 batch was stopped after repeated HTTP 429 responses. The completed pilots are published now; rerun the larger benchmarks when your Bifrost route has sufficient capacity. From the repository root, with the gateway and existing judge variables set:

```sh
MODEL_API_KEY="${MODEL_API_KEY:-local}" evals/agent-ab/run --repeat 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-full
MODEL_API_KEY="${MODEL_API_KEY:-local}" benchmarks/terminal-bench/run --attempts 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-full
AKM_BIN=akm benchmarks/longmemeval/run --model freellm/gpt-oss:120b --label bifrost-gpt120-full
```

Use an `akm` binary whose `--version` is `0.10.261003-beta` for the last command. The one-shot recipe checks that version before running any suite.

The host crashed before the remaining Qwen batches finished. At that point, extract had completed one of three repeats; the second stopped after six saved samples. Consolidate had completed two of three repeats; the third stopped after 33 saved samples. Promotion and bakeoff had not started. The crash cause was not established. These partial runs remain local and are excluded from the published results.

Recovery completed on 2026-10-13 (UTC), with one serial worker on v0.4. It collected two replacement extract repeats, the remaining consolidate repeat, and three full repeats each of nightly, promotion, bakeoff and reflect. All six batches exited successfully. The commands below record that recovery; use the same Bifrost and judge settings, set `MODEL_NAME=chat/qwen3.8-27b`, and set `AKM_BIN` to the requested beta. Run each command to completion before starting the next. The interrupted repeats restarted from their first case; these evals do not resume partial samples.

```sh
evals/nightly/run --repeat 3 --label bifrost-qwen-akm-0.10-v04
evals/extract/run --repeat 2 --label bifrost-qwen-akm-0.10-recovery
evals/consolidate/run --label bifrost-qwen-akm-0.10-recovery
evals/promotion/run --repeat 3 --label bifrost-qwen-akm-0.10-v04
evals/bakeoff/run --repeat 3 --label bifrost-qwen-akm-0.10-v04
evals/reflect/run --repeat 3 --label bifrost-qwen-akm-0.10-v04
```

The [q018 recipe](reproduction/regrade-q018.ts) graded only the three missing surviving refs using the production relevance prompt. Their grades are 3, 2 and 2; the 1,499 original grades remain unchanged. The old rows are stamped `legacy`, so the mixed-judge provenance warning is retained even though the historical documentation names the same Qwen alias.

## Matrix and upgrade example

The [matrix recipe](reproduction/reflect-matrix.json) compares normal reflect with its defect filter disabled, on three public cases and three repeats. The [decision](matrix/bifrost-reflect-example/decision.md) found no difference. This small example demonstrates the workflow and cannot establish a quality improvement.

The same two-row screen was first run using the real v0.2 checkout and Bifrost. Its saved state was then opened with v0.3: both rows ran again once because the fingerprint changed. A second unchanged screen skipped both. Confirm collected three repeats of each row, and the published paired report rescored both sides with the current scorer.

```sh
scripts/compare/run --repeats reports/0.10.261003-beta/reflect/bifrost-reflect-example-base-c --against reports/0.10.261003-beta/reflect/bifrost-reflect-example-filter-off-c --treatment config
```

## Limits observed in the real runs

- Bifrost's FreeLLM route returned HTTP 429 after the initial GPT-120 pilots: two routes were rate limited or cooling down and three had no usable key. Its advertised cooldown was about nine minutes. Full end-to-end LongMemEval and Terminal-Bench scores require enough quota to finish; the small pilots here are demonstrations.
- The five-question LongMemEval pilot has one errored arm and three answers cut off at 512 tokens. Four questions have two scored arms. Its Qwen judge differs from the benchmark's prescribed GPT-4o judge, so it is not comparable to published LongMemEval scores. No quality conclusion follows from five questions.
- The one-task agent pilot scored 0/1 for control and 1/1 for AKM, with AKM search and show observed. The one-task Terminal-Bench pilot scored 0/1 in both arms. One task is insufficient to estimate either difference.
- The semantic retrieval library run is aborted because `akm curate` returns no `searchMode` for notification n08, while the harness requires proof of semantic search. The installed beta's `dist/core/non-task-input.js` and `dist/commands/read/curate.js` confirm that a tool envelope deliberately abstains before searching, returning no mode. The harness needs to distinguish this intentional abstention from a failed semantic call. The full keyword runs use `--semantic off`; the aborted run is not counted as a successful semantic result.
- The original three full reflect repeats recorded `ASSET_NOT_FOUND` from `akm feedback` for six refs. An isolated index confirmed that AKM returns community-manager as `agents/knowledge/skills/ai-skills/llm-delegation-tool/examples/agents/community-manager`, while the old harness derived `knowledge/skills/ai-skills/llm-delegation-tool/examples/agents/community-manager` from its path. Pinned 0.9.26 returns the same prefixed ref. V0.4 resolves the actual indexed ref, fixing that harness assumption.
- Each fresh v0.4 reflect repeat still records six errors, now AKM file-layout refusals under its generic `unsupported_type` reason. The installed CLI's `fileOutsideLayoutFailure` blocks a proposal when its derived output path differs from the indexed file, avoiding a duplicate asset. All 50 cases were attempted; the six refusals remain in the artifacts and are excluded from correctness, leaving 44 scored cases. These scores do not establish full compatibility.
- The original nightly attempt failed during setup with the same community-manager `ASSET_NOT_FOUND`, before model calls. All three v0.4 nightly repeats completed setup and all 35 cases, with zero collection errors and zero failed model calls. Layout-refused changes count as misses in nightly. V0.4 maps indexed refs back to the case files for scoring; nightly and reflect use measurement version 0.3. Earlier artifacts remain unchanged, and comparisons with earlier collectors require `--treatment harness`.

## Observed baselines

Judge-gate completed all 106 cases in each of three repeats, without errors. Precision ranged from 46.7% to 61.5%. The mean verdict flip rate between pairs of repeats was 6.3%: ten cases changed verdict across the three runs. Treat small changes as variation until repeated comparisons establish otherwise.

Distill completed all 38 cases in each of three repeats, without errors. Good-lesson rates ranged from 35.7% to 50.0%; all three repeats correctly updated 2/8 existing lessons. The CLI and newer lesson-update flow ran successfully, while these scores leave substantial room to improve the model's decisions.

Consolidate completed three 60-case repeats without errors, including the recovery run. It safely retired 22/30, 24/30 and 24/30 eligible notes, with no unsafe retirement in any repeat. Extract completed three 20-session repeats without errors, including two replacement runs. They found 11/11, 11/11 and 10/11 insights or preferences, left all five routine sessions empty each time, and saved none of the four planted instructions.

Nightly completed three 35-case repeats without collection errors. It passed 26/35, 26/35 and 27/35 cases; the harm counts were 1, 1 and 0. The mean verdict flip rate was 5.7%, with three cases differing across repeats. These results validate the repaired collector while retaining the model's misses and harmful changes.

Fresh reflect fixed 25/27 scored defects in all three repeats and preserved 16/17, 15/17 and 16/17 scored controls. The mean verdict flip rate was 7.6% over the 44 scored cases, with five cases differing across repeats. The six file-layout refusals per run remain outside that denominator.

Promotion completed three 20-case repeats without errors. It accepted 5/6 good candidates each time; accepted-candidate precision was 83.3%, 100% and 100%. It also accepted one of 14 bad candidates in the first repeat, a duplicate, and none in the other two. One case differed across repeats, for a mean flip rate of 3.3%.

Bakeoff completed three 15-case repeats without errors. All outputs were valid; 12/15 cases passed in every repeat, with no verdict flips. The same three cases failed: memory inference lost an explicit date, session summary omitted required identifiers, and consolidate/promote changed a protected operator-preference memory and produced the wrong promotion count. These small case sets and three-repeat samples limit the conclusions that follow from the scores.

All three keyword retrieval repeats matched. Library search and curate had nDCG@10 0.8030 and recall@10 0.8307 over 101 judged task queries; the remaining notification queries measure a separate behavior. Books keyword nDCG@10 was 0.8768 and recall@10 0.9542 over 51 queries. Books has sparse judgments (24.3% of top-ten keyword results judged), so the recorded condensed metrics and judgment coverage matter when interpreting these scores.

LongMemEval's full retrieval-only run completed all 500 questions without errors. On the 470 questions with answer evidence, top-five retrieval hit rate was 97.45%, recall 93.05%, and MRR 0.9202. Thirty abstention questions are reported separately. This measures evidence retrieval; no answer model or judge was called.

SkillRet completed all 4,392 queries over 6,006 skills without errors. Keyword search nDCG@10 was 0.5047 and recall@10 0.5838; semantic search reached 0.5800 and 0.6618 respectively. Curate returned search's ranking on all 200 checked queries in each mode. The semantic run uses the pinned local bge-small-en-v1.5 embedder with AKM's ranking, so it does not measure GPT-120 or the Qwen pool.
