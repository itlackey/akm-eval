# Bifrost runs on AKM 0.10.261003-beta

These are public cases collected by the real AKM CLI and real models, on 2026-10-12. `summary.json` and `samples.jsonl` are copied unchanged from completed runs. The [index](../README.md) lists every published folder. Aborted runs are kept locally and are described below rather than presented as baselines.

The model-driven evals use the existing Bifrost alias `chat/qwen3.8-27b`. It is a gateway pool; these results do not claim one fixed quantization or inference host. Larger model pilots use `freellm/gpt-oss:120b` through the same gateway. The existing Qwen judge is reused. Retrieval and SkillRet use AKM's pinned built-in embedding model locally; their runs call no model service.

The source is the readiness change in [PR #79](https://github.com/itlackey/akm-eval/pull/79), commit `894bfff`, based on v0.3. Some runs began before the patch was committed and record `dd34863-dirty`. Their manifests and `harness_sha256` record the actual code and inputs. Public artifacts and documentation added afterward do not change those code digests. The Docker arm uses plugin `0.10.261002-beta`, whose dependency is the requested CLI, with the committed dependency locks. The original pinned plugin failed its first pilot because it called `--shape` on the 0.10 CLI; that result is not a performance baseline.

## Reproduce

Install Bun 1.4.2 and `akm-cli@0.10.261003-beta`. Set `MODEL_BASE_URL` to your Bifrost `/v1` endpoint and `JUDGE_BASE_URL` to the same endpoint. Set credentials in your local environment only if your gateway requires them. Docker and uv are needed for the agent benchmarks. Dataset files and model caches are fetched at runtime and are not published here.

```sh
bash reports/0.10.261003-beta/reproduction/run-public.sh
```

That recipe runs the complete suites. Start each larger model benchmark with `--limit` to verify your gateway quota before launching it. `local` in the Harbor command is a dummy value because Harbor requires a nonempty key even for a keyless gateway. LongMemEval supports `--resume DIR`; it retries the questions whose arms errored, provided the source, model, settings and questions still match.

The full GPT-120 batch was stopped after repeated HTTP 429 responses. The completed pilots are published now; rerun the larger benchmarks when your Bifrost route has sufficient capacity. From the repository root, with the gateway and existing judge variables set:

```sh
MODEL_API_KEY="${MODEL_API_KEY:-local}" evals/agent-ab/run --repeat 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-full
MODEL_API_KEY="${MODEL_API_KEY:-local}" benchmarks/terminal-bench/run --attempts 3 --model freellm/gpt-oss:120b --akm akm-cli@0.10.261003-beta --label bifrost-gpt120-full
AKM_BIN=akm benchmarks/longmemeval/run --model freellm/gpt-oss:120b --label bifrost-gpt120-full
```

Use an `akm` binary whose `--version` is `0.10.261003-beta` for the last command. The one-shot recipe checks that version before running any suite.

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
- The semantic retrieval library run is aborted because `akm curate` returns no `searchMode` for notification n08, while the harness requires proof of semantic search. The full keyword runs use `--semantic off`; that limitation is explicit and is not counted as a successful semantic result.
- The full reflect run records `ASSET_NOT_FOUND` from `akm feedback` for six refs, after indexing each case's supplied asset. An isolated index confirmed that AKM returns community-manager as `agents/knowledge/skills/ai-skills/llm-delegation-tool/examples/agents/community-manager`, while the harness derives `knowledge/skills/ai-skills/llm-delegation-tool/examples/agents/community-manager` from its path. The harness should resolve the indexed ref instead of assuming it. These errored cases are included in the artifacts and excluded from the scorer's correctness denominator; the displayed correctness rate alone does not establish full compatibility.

## Observed baselines

Judge-gate completed all 106 cases in each of three repeats, without errors. Precision ranged from 46.7% to 61.5%. The mean verdict flip rate between pairs of repeats was 6.3%: ten cases changed verdict across the three runs. Treat small changes as variation until repeated comparisons establish otherwise.

All three keyword retrieval repeats matched. Library search and curate had nDCG@10 0.8030 and recall@10 0.8307 over 101 judged task queries; the remaining notification queries measure a separate behavior. Books keyword nDCG@10 was 0.8768 and recall@10 0.9542 over 51 queries. Books has sparse judgments (24.3% of top-ten keyword results judged), so the recorded condensed metrics and judgment coverage matter when interpreting these scores.

LongMemEval's full retrieval-only run completed all 500 questions without errors. On the 470 questions with answer evidence, top-five retrieval hit rate was 97.45%, recall 93.05%, and MRR 0.9202. Thirty abstention questions are reported separately. This measures evidence retrieval; no answer model or judge was called.
