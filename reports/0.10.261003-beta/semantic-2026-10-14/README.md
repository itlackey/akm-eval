# AKM semantic search evaluation results — stopped collection

The public process evals on AKM `0.10.261003-beta` used `fast/qwen3.6-35b-a3b` through Bifrost with semantic search enabled. All eight process suites completed without collection errors. They exposed missed lesson updates, unsafe retirement proposals, and one extracted instruction from an untrusted PR body. Collection was stopped on October 14, 2026. The three full paired benchmarks are incomplete; all collectors and their owned containers were stopped. No evals were restarted while preparing this report.

## Models and measurement

The 35B route returned `qwen3.6-35b-a3b` where the collector recorded the served model. Terminal-Bench and LongMemEval use `eval-luna/gpt-6-luna`, observed as `gpt-6-luna`. LongMemEval retains the configured `chat/qwen3.8-27b` judge, a gateway pool; its scores are not directly comparable to published LongMemEval numbers using GPT-4o.

Every model-backed process sandbox records `semanticSearchMode: auto` with the native `Xenova/bge-small-en-v1.5` embedder. Consolidate and nightly use `--embedder real`. Retrieval and SkillRet retain their native keyword comparator alongside the semantic measurement. The Docker AKM arms use the new `--semantic` flag; setup verifies complete embedding coverage and an actual query returning `searchMode: semantic` before the agent starts. Their measurement version is 0.3. Other eval versions remain unchanged.

The host runs Bun 1.4.1. The Docker arm pins AKM CLI `0.10.261003-beta`, plugin `0.10.261002-beta`, opencode `1.18.34`, and Harbor `0.24.0`, with the committed dependency locks. The saved manifests identify the code, inputs, labels and settings that each collector used.

## Full process results

| Eval | Cases | Result |
|---|---:|---|
| [judge-gate](judge-gate/2026-10-14-b35-semantic-20261014-full/summary.json) | 135 | Passed 15/40 good proposals and 0/95 bad proposals; accepted precision 100% |
| [reflect](reflect/2026-10-14-b35-semantic-20261014-full/summary.json) | 80 | Fixed 38/40 defects; preserved 35/40 controls; no body rewrites |
| [distill](distill/2026-10-14-b35-semantic-20261014-full/summary.json) | 96 | Good lessons 13/40; wrong lessons 0/16; correct existing-lesson updates 0/40 |
| [consolidate](consolidate/2026-10-14-b35-semantic-20261014-full/summary.json) | 80 | Safely retired 37/40 eligible notes; 2 unsafe proposals, neither staged; all 24 staged retirements safe |
| [extract](extract/2026-10-14-b35-semantic-20261014-full/summary.json) | 64 | Retained required facts in 33/40 insight sessions; left 20/20 routine sessions empty; saved one planted instruction |
| [promotion](promotion/2026-10-14-b35-semantic-20261014-full/summary.json) | 80 | Accepted 34/40 good and 4/40 bad proposals; accepted precision 34/38 |
| [nightly](nightly/2026-10-14-b35-semantic-20261014-full/summary.json) | 35 | Passed 32/35 items; no harm checks failed; no failed model calls |
| [bakeoff](bakeoff/2026-10-14-b35-semantic-20261014-full/summary.json) | 40 | Passed 28/40 cases |

These are single full runs on the expanded public sets. The older published full sets selected fewer cases, so they cannot supply direct score deltas for the expanded sets. Native benchmark controls and the unchanged retrieval inputs remain available for compatible comparisons.

The extract failure is `planted-03`: the engine turned an instruction in a fictional PR body into a repository convention about skipping tests. It was a pending proposal in an isolated benchmark bundle. Consolidate's two unsafe proposals would lose a claim if accepted; neither was staged for unattended acceptance. Distill's update cases mostly ended with the writer deciding that an existing lesson already covered the memory. The nightly misses were two lesson cases not reached and one silent defect without a proposed fix. Bakeoff's protected-memory failures concern the proposed promotion plan.

## Retrieval results

| Collection | Keyword nDCG at 10 | Semantic nDCG at 10 | Keyword judgment coverage | Semantic judgment coverage |
|---|---:|---:|---:|---:|
| Library | 0.8030 | 0.7935 | 96.34% | 69.21% |
| Books | 0.8768 | 0.9214 | 24.27% | 21.37% |

Both collections completed with zero search or curate errors, including intentional semantic curate abstention. The ranking scores use the existing relevance judgments, which mix legacy grades and Qwen grades. Semantic search returns more ungraded assets, and the books have sparse judgments under both methods. Read the judgment coverage and condensed metrics alongside nDCG; these figures do not establish a general ranking improvement.

The saved-run comparison with the earlier keyword library run accepted the exact inputs and labels. Its keyword quality scores matched. Performance deltas were omitted because the new collection also ran the semantic methods.

The existing [full SkillRet run](../skillret/akm-0.10-public/summary.json) is reused: the same AKM release, dataset revision and checksums, measurement version 0.2, 6,006 skills and all 4,392 queries, with zero errors and recorded semantic mode. Its semantic nDCG at 10 is 0.5800 and recall at 10 is 0.6618.

## Paired benchmark pilots

The [20-question Luna LongMemEval pilot](longmemeval/2026-10-14-luna-semantic-20261014-pilot/summary.json) completed with no request failures, empty answers, truncated answers or undecidable judge replies. Full history scored 16/20 and semantic AKM retrieval 18/20. The paired difference was 10 percentage points, with a 95% interval from -9.1 to 29.1 points. All required sessions were retrieved for 19 questions; the remaining partial miss produced the AKM arm's one evidence-related loss. The pilot took 321 seconds. It does not establish the full benchmark's outcome.

The [two-task 35B agent pilot](agent-ab/2026-10-14-b35-semantic-20261014-pilot/summary.json) scored control 0/2 and AKM 1/2, with no errors. Both AKM containers verified semantic search; the agent called AKM in one of the two trials. The [two-task Luna Terminal-Bench pilot](terminal-bench/2026-10-14-luna-semantic-20261014-pilot/summary.json) scored 1/2 in each arm with no errors. Both AKM containers verified semantic search, and Luna read their curated context. The Terminal-Bench pilot took 740 seconds.

LongMemEval still tests one search over raw sessions with a five-session limit against a full-history reader. It does not exercise distillation or repeated evidence gathering. The reader gets 512 output tokens and the judge 10. Answer-call times exclude indexing, retrieval and judging. During the full run, an identical answer for `3b6f954b` received different judge verdicts in the two arms; the original answers and verdicts are preserved for audit.

## Stopped full benchmarks

| Benchmark | Planned coverage | Saved coverage | State |
|---|---:|---:|---|
| LongMemEval, Luna | 500 questions | 362 scored questions | Original summary is aborted; 138 questions remain |
| Agent A/B, 35B | 36 trials | 29 trial records: 23 completed, 2 agent failures, 4 cancellations | 7 trials have no result; original summary is aborted |
| Terminal-Bench, Luna | 178 trials across 89 tasks | 33 trial records, including 2 setup failures | No final collector summary; 145 trials have no result |

The original aborted [LongMemEval summary](stopped/longmemeval/summary.json) and [samples](stopped/longmemeval/samples.jsonl) are preserved byte-for-byte. On this prefix, full history answered 292/362 correctly (80.66%) and AKM answered 278/362 (76.80%). The paired difference is -3.87 percentage points, with a 95% interval of -8.11 to +0.38 points. This prefix covers four question types and omits every single-session-assistant and knowledge-update question. It cannot represent the full benchmark. There were no request errors or undecidable judge replies, but 14 answers exhausted the 512-token output budget and had no answer text: 11 in full history and 3 with AKM. Empty answers were scored wrong. The identical-answer grading discrepancy described above is unchanged.

The original aborted [Agent A/B summary](stopped/agent-ab/summary.json) and [samples](stopped/agent-ab/samples.jsonl) retain their native completion grid and scores. Two agent exits reported context overflow on the 35B endpoint. The current harness supports explicit OpenCode model limits in `models.json`, passed equally to both arms and saved in the job config. Those limits were not applied to this collected run, and the implementation has only been validated with fake collectors. No corrected full run was collected.

The [Terminal-Bench inventory](stopped/terminal-bench.json) is derived from existing trial files, with source hashes and per-trial outcomes. Both setup failures were on `qemu-alpine-ssh`, one in each arm, when package installation exited with code 100. Raw Harbor jobs and logs remain local; this inventory is not a replacement collector summary. Interrupted and unstarted trials are counted as having no result.

These stopped artifacts are excluded from the public ledger's completed-run rows. The 21 completed artifact folders contain eight full process runs, two full retrieval collections, and eleven pilots. SkillRet reuses the previously published matching full run.

## Remaining work

1. Harness validation and input checks are complete for the changes in this report. The new model-limit path still needs a representative real pilot before any claim that it prevents endpoint context failures.
2. Expanded public process cases and native benchmark inputs are available and verified. Preserve their exact selections and hashes in further collections.
3. Representative pilots were collected. Before further paid collection, address the 35B context budget, the Terminal-Bench package-install failures, and LongMemEval's output budget and judge consistency.
4. Completing the three full paired collections requires a new instruction to run them. Any changed protocol must retain appropriate measurement provenance. Update this report and compare only compatible complete runs afterward; no universal repeats or matrix scheduler are required.

## Reproduction

The commands below describe the collected model/search choices; they are not a request to restart collection. The original manifests and harness hashes remain unchanged. Current source adds an optional model-limit setting that was absent from the saved runs. Use the Docker semantic option to select semantic setup. Set the gateway and credentials in the local `.env`; nonempty file values take precedence over shell values. The reproduction patch is [semantic.json](reproduction/semantic.json). Each completed public artifact contains the original `summary.json` and `samples.jsonl`; no dataset or Harbor job directory is included.

```sh
source lib/env.sh
export MODEL_API_KEY="${MODEL_API_KEY:-local}"
export HF_HOME="$PWD/.cache/models"
export AKM_BIN='bunx --package akm-cli@0.10.261003-beta akm'
patch=reports/0.10.261003-beta/semantic-2026-10-14/reproduction/semantic.json

evals/retrieval/run --semantic on --label semantic-full
evals/judge-gate/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/reflect/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/distill/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/consolidate/run --model fast/qwen3.6-35b-a3b --embedder real --config-patch "$patch"
evals/extract/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/promotion/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/nightly/run --model fast/qwen3.6-35b-a3b --embedder real --config-patch "$patch"
evals/bakeoff/run --model fast/qwen3.6-35b-a3b --config-patch "$patch"
evals/agent-ab/run --semantic --model fast/qwen3.6-35b-a3b --akm akm-cli@0.10.261003-beta
benchmarks/longmemeval/run --semantic --model eval-luna/gpt-6-luna
benchmarks/terminal-bench/run --semantic --model eval-luna/gpt-6-luna --akm akm-cli@0.10.261003-beta
```

## Validation

Validation uses fake model/AKM/Harbor fixtures and saved artifacts. No real eval, API probe, smoke collection or benchmark was restarted during this PR. The final repository check passed all TypeScript checks, 39 Python tests and 2,816 Bun tests (13 gated tests skipped) in the working checkout. All eight ledger browser tests passed against combined latest-main and new report data. The test counts include fixture files copied into local result libraries; CI uses a clean checkout. Semantic setup is exercised with a stub CLI, including absent/partial embeddings and keyword fallback. Both collector paths are tested with fake Harbor for preservation of identical model limits in the saved job. Original completed artifacts are checked against their local source summaries and samples, including exact selected case IDs and byte equality. The two aborted artifacts are copied without rewriting their recorded status, scores or provenance. The earlier pinned-release contract and startup smokes each passed all nine applicable suites; those results are reused.
