# Repo-map assets and fenced code in search: the full-system runs

Phase 3 of [akm#1260](https://github.com/itlackey/akm/issues/1260), on October 27, 2026 UTC: the runs that phases 1–2 ([`README.md`](README.md)) could not make, following [`finish-on-full-system.md`](finish-on-full-system.md) sections 1 to 5. This host had Docker, the embedding model and a judge endpoint. The thresholds below are the ones agreed on the issue before these runs; this report gives the evidence and the verdict each implies. The decisions are the maintainer's.

## Verdicts

The owner's rule for this spike decides the verdicts: *the feature set is supposed to reduce token usage, or give better results at about the same token usage; flooding the context to get marginal gains in evals is a failed design.* The issue's thresholds are kept beside it. Token figures are bytes ÷ 4, an estimate.

| Decision | Threshold (issue, agreed before the runs) | Quality | Tokens/bytes to the agent | Verdict against the owner's rule |
|---|---|---|---|---|
| **B** | B1b (or the best option that indexes no literal values) clearly improves `code` with real-judge grades in both keyword and semantic modes; no meaningful regression on `library` or `books`; no secret or env bytes in the index; fragments, fragment ids and `show` unchanged | `code` nDCG@10 b0 → B1b: keyword 0.530 → 0.764 (+0.234; MRR 0.638 → 0.923; Success@5 75.0% → 96.4%), semantic 0.494 → 0.614 (+0.120; MRR 0.618 → 0.726). `library` keyword 0.745 → 0.771, semantic 0.811 → 0.826; `books` identical result lists | Unchanged per hit: a `search --detail agent` hit is about 545 B (~136 tokens) on every build and set, b0, B1b and B3 alike, because B changes what is *indexed*, not what a hit carries (no hit has a snippet or content field). Per call (10 hits), `code` keyword search 10,725 → 10,914 B (+1.8%, because b0 returns fewer hits, 8.6 against 8.8); `library` 12,095 → 12,115 B; `books` identical; semantic calls within ±0.1%. The index grows +10.5% (keyword) and +8.9% (semantic) on disk: a storage cost, not an agent-token cost | **Go for B1b**: better results at the same tokens per call (the first relevant asset comes earlier, `code` keyword MRR 0.638 → 0.923, so fewer follow-up reads are needed). It also clears the issue's thresholds: no secret value of the probe in B1b's index (variable names are; see the constraints), fragment text identical on all four builds, 40 of 40 `show` fragment reads byte-identical. B1c was not needed: semantic search did not regress |
| **A** | The inline-code repo map improves agent-ab localization pass rate, or cuts tokens and tool calls per task by 10% or more, with no accuracy loss | Not measured. In the one complete run (b0), 24 of 42 trials hit the 35B server's context limit (15 of 21 akm-arm trials, 9 of 21 control), and no akm-arm agent called akm or read the plugin's curated results (engagement 0 of 21) | The akm arm used more, not less: 74,197 against 59,292 input tokens per trial (+25%), 5.9 against 4.8 tool calls, with the map never fetched. One fetch of today's largest map asset would be ~30,000 tokens (`commands`, 121,527 B) in a 32,768-token window | **No verdict.** The run does not answer A. As built, the fixture fails the rule's premise (a single read can flood the window); a valid measurement needs a map the agent reads in small pieces (options below) |

## What ran

| | |
|---|---|
| akm builds | b0 `f8f97704` (`release/0.10.0`, prints 0.10.261015); prototypes `spike/1260-b1` `d57a3f79`, `spike/1260-b1b` `55ce53f6`, `spike/1260-b3` `b98738aa`; each run as `bun <checkout>/src/cli.ts` with `bun install --frozen-lockfile`. B2 was not carried forward (it matched B1 in phase 2). No B1c branch was made |
| Embedder | Every build embeds natively: a sandboxed `akm index --full` of each reports `verification.embeddingRuntime: "onnxruntime-node"`, `semanticStatus: "ready-js"`. The model `Xenova/bge-small-en-v1.5` was copied into the worktree's `.cache/models`; nothing was downloaded |
| Judge | `.env` `JUDGE_MODEL=eval-judge-35b`, a `models.json` line that sends `fast/qwen3.6-35b-a3b` on the lab gateway with `max_tokens` 64; temperature 0, `reasoning_effort: none`, prompt `umbrela-akm-v1`, 16,000-character window. label prints and stamps the resolved id, `judge fast/qwen3.6-35b-a3b`. It is the same model, on the same server, as the agent-ab model, so label and agent-ab never overlapped |
| agent-ab | `--model fast/qwen3.6-35b-a3b` (its `models.json` line sets context 32,768 and output 4,096), `--semantic`, `--cases evals/agent-ab/cases/repomap`, `--akm <checkout>` of b0 (and of B1b, a run that was stopped; each built with `bun run build` first, so `npm pack` took a current `dist/`), opencode 1.18.34, plugin 0.10.261002-beta (the checkouts hold no plugin), Harbor 0.24.0, 4 trials at a time, 3 attempts per task and arm |
| Retrieval | `evals/retrieval/run --semantic --akm "bun <checkout>/src/cli.ts"`: public (`library`, `books`) and `--cases` `code`, `repomap`, `repomap/fenced`, once per build; 16 runs, all `complete`, 0 errors, every semantic index `cold` (built for that build), every search reporting `semantic` |
| akm-eval | branch `spike/1260-full-system` from `spike/1260-repomap-codeblocks` `3d3d8e9` |

### Section 1: the contract smoke

`scripts/smoke/run --contract --akm "bun <checkout>/src/cli.ts"` on b0, B1, B1b and B3: each `9 run, 9 reached their outcomes, 4 skipped` (agent-ab and terminal-bench need Docker in the smoke's design, LongMemEval and SkillRet download datasets), exit 0.

## Grades

### `code`, `repomap`, `repomap/fenced`: the judge replaces the provisional review

As the runbook says, each set's `qrels.jsonl` was moved to `qrels.claude-review.jsonl` (kept beside the new grades), `evals/retrieval/label --cases <set>` graded the pool of b0 (keyword search and curate, the BM25, the expected assets), and `label --cases <set> --from <run>` graded what each of the four semantic runs returned in any column, keyword and semantic.

| Set | Pairs graded by the judge | Grades 0 / 1 / 2 / 3 | Queries left with no relevant asset |
|---|---:|---|---|
| `code` | 572 (384 pool + 137 + 38 + 5 + 8 from the runs) | 432 / 32 / 33 / 75 | 2 of 30: `c18` (the `AICORE_*` line starts at character 26,183 of a 33,315-character asset, past the judge's 16,000-character window) and `c20` (the judge gave the expected `cli-workflow-creator` a 1) |
| `repomap` | 228 (154 + 74) | 158 / 16 / 22 / 32 | 1 of 20: `r15` |
| `repomap/fenced` | 258 (167 + 77 + 11 + 3) | 151 / 31 / 40 / 36 | 1 of 20: `r15` |

So `code` is scored on 28 queries and both map sets on 19. Every run below is at 100% `judged@10` on these sets.

Agreement between the judge and the provisional `claude-review` grades, on the pairs both graded:

| Set | Pairs in both | Relevant/not agree | Cohen's κ | Exact grade | Within one grade | Review relevant, judge not | Judge relevant, review not |
|---|---:|---:|---:|---:|---:|---:|---:|
| `code` | 419 | 86.4% | 0.52 | 68.3% | 90.2% | 5 | 52 |
| `repomap` | 228 | 80.7% | 0.34 | 70.6% | 81.1% | 7 | 37 |
| `repomap/fenced` | 258 | 76.0% | 0.28 | 62.8% | 78.3% | 5 | 57 |

The judge calls far more pairs relevant than the review did (94 against 47 relevant pairs on `code`), and almost every disagreement is that. More relevant assets raise the ideal ranking and the recall denominator, which is why every absolute score on these sets is lower than in phases 1–2 (`code` B1b keyword 0.927 on the provisional grades, 0.764 here). The comparison between builds is what the thresholds read, and every build is scored on the same grades. Unlike the review, the judge grades the inline and the fenced variant of a map asset separately (it reads different text), so the two map sets now have different qrels and their absolute scores do not compare as cleanly as in phase 2.

### `library`: a label expansion

The prototypes surfaced unjudged `library` results (phase 2: 95–96% `judged@10`). `evals/retrieval/label --from` on each of the four semantic `library` runs graded every unjudged pair in their top tens, keyword and semantic: 138 pairs over 69 queries (103 of grade 0, 14 of 1, 10 of 2, 11 of 3), appended to `evals/retrieval/assets/qrels.jsonl` with the judge's provenance. It is recorded as [the 2026-10-27 expansion](../../evals/retrieval/assets/judgment-expansion-20261027.md); the retrieval `scoringVersion` is 0.4 (`MEASUREMENT_CHANGELOG.md`). After it every `library` column of the four runs is 100% judged. `books` was not graded: label grades the `library` collection of a public run only, and books' result lists are identical on all four builds (checked row by row, every column), so its 94.9% (keyword) and 93.7% (semantic) `judged@10` cannot move a comparison.

Every run was then rescored with `scripts/rescore/run` on the final grades (`-rescored` folders, b0 included), and `scripts/compare/run` read b0 against each prototype per set.

## Results (rescored on the final grades)

`search` and `curate` returned the same ranking on every task query of every set, so one column per mode is shown. Wall seconds are of the whole run (indexing included); the b0 runs were the first of the round and overlapped the Harbor oracle and nop checks, so their wall times are the least comparable.

### `library` (101 scored queries)

| akm | mode | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | wall s | semantic index s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | keyword | 0.745 | 0.911 | 0.722 | 97.0% | 100.0% | 276 | 23.8 |
| b0 | semantic | 0.811 | 0.936 | 0.817 | 96.0% | 100.0% | 276 | 23.8 |
| B1 | keyword | 0.769 | 0.923 | 0.765 | 98.0% | 100.0% | 248 | 19.8 |
| B1 | semantic | 0.827 | 0.951 | 0.846 | 99.0% | 100.0% | 248 | 19.8 |
| **B1b** | keyword | 0.771 | 0.923 | 0.767 | 98.0% | 100.0% | 250 | 19.8 |
| **B1b** | semantic | 0.826 | 0.951 | 0.849 | 99.0% | 100.0% | 250 | 19.8 |
| B3 | keyword | 0.772 | 0.923 | 0.766 | 98.0% | 100.0% | 286 | 22.7 |
| B3 | semantic | 0.828 | 0.950 | 0.846 | 99.0% | 100.0% | 286 | 22.7 |

### `books` (51 scored queries)

| akm | mode | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | wall s | semantic index s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | keyword | 0.836 | 0.905 | 0.937 | 100.0% | 94.9% | 107 | 7.6 |
| b0 | semantic | 0.911 | 0.945 | 0.971 | 100.0% | 93.7% | 107 | 7.6 |
| B1 | keyword | 0.836 | 0.905 | 0.937 | 100.0% | 94.9% | 86 | 5.6 |
| B1 | semantic | 0.911 | 0.945 | 0.971 | 100.0% | 93.7% | 86 | 5.6 |
| **B1b** | keyword | 0.836 | 0.905 | 0.937 | 100.0% | 94.9% | 106 | 6.3 |
| **B1b** | semantic | 0.911 | 0.945 | 0.971 | 100.0% | 93.7% | 106 | 6.3 |
| B3 | keyword | 0.836 | 0.905 | 0.937 | 100.0% | 94.9% | 103 | 7.4 |
| B3 | semantic | 0.911 | 0.945 | 0.971 | 100.0% | 93.7% | 103 | 7.4 |

### `code` (28 scored queries)

| akm | mode | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | wall s | semantic index s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | keyword | 0.530 | 0.638 | 0.591 | 75.0% | 100.0% | 101 | 32.5 |
| b0 | semantic | 0.494 | 0.618 | 0.581 | 67.9% | 100.0% | 101 | 32.5 |
| B1 | keyword | 0.742 | 0.912 | 0.741 | 96.4% | 100.0% | 71 | 20.2 |
| B1 | semantic | 0.605 | 0.725 | 0.687 | 78.6% | 100.0% | 71 | 20.2 |
| **B1b** | keyword | 0.764 | 0.923 | 0.750 | 96.4% | 100.0% | 76 | 21.2 |
| **B1b** | semantic | 0.614 | 0.726 | 0.705 | 82.1% | 100.0% | 76 | 21.2 |
| B3 | keyword | 0.774 | 0.946 | 0.748 | 96.4% | 100.0% | 88 | 26.2 |
| B3 | semantic | 0.614 | 0.725 | 0.698 | 82.1% | 100.0% | 88 | 26.2 |

### `repomap` (19 scored queries)

| akm | mode | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | wall s | semantic index s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | keyword | 0.670 | 0.731 | 0.794 | 84.2% | 100.0% | 41 | 4.4 |
| b0 | semantic | 0.785 | 0.790 | 0.987 | 94.7% | 100.0% | 41 | 4.4 |
| B1 | keyword | 0.670 | 0.731 | 0.794 | 84.2% | 100.0% | 38 | 4.2 |
| B1 | semantic | 0.785 | 0.790 | 0.987 | 94.7% | 100.0% | 38 | 4.2 |
| **B1b** | keyword | 0.670 | 0.731 | 0.794 | 84.2% | 100.0% | 42 | 4.5 |
| **B1b** | semantic | 0.785 | 0.790 | 0.987 | 94.7% | 100.0% | 42 | 4.5 |
| B3 | keyword | 0.670 | 0.731 | 0.794 | 84.2% | 100.0% | 40 | 4.3 |
| B3 | semantic | 0.785 | 0.790 | 0.987 | 94.7% | 100.0% | 40 | 4.3 |

### `repomap/fenced` (19 scored queries)

| akm | mode | nDCG@10 | MRR | Recall@10 | Success@5 | judged@10 | wall s | semantic index s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | keyword | 0.498 | 0.548 | 0.574 | 68.4% | 100.0% | 42 | 4.5 |
| b0 | semantic | 0.715 | 0.765 | 0.877 | 100.0% | 100.0% | 42 | 4.5 |
| B1 | keyword | 0.697 | 0.860 | 0.746 | 100.0% | 100.0% | 38 | 3.9 |
| B1 | semantic | 0.773 | 0.829 | 0.900 | 100.0% | 100.0% | 38 | 3.9 |
| **B1b** | keyword | 0.697 | 0.860 | 0.746 | 100.0% | 100.0% | 41 | 4.4 |
| **B1b** | semantic | 0.774 | 0.829 | 0.900 | 100.0% | 100.0% | 41 | 4.4 |
| B3 | keyword | 0.720 | 0.912 | 0.796 | 100.0% | 100.0% | 42 | 5.2 |
| B3 | semantic | 0.772 | 0.811 | 0.942 | 100.0% | 100.0% | 42 | 5.2 |

### By query kind (nDCG@10, b0 → B1b)

| Set, kind | keyword | semantic |
|---|---|---|
| `library` `name` (21) | 0.817 → 0.870 | 0.811 → 0.853 |
| `library` `paraphrase` (26) | 0.565 → 0.603 | 0.698 → 0.727 |
| `library` `direct` (38) | 0.799 → 0.809 | 0.859 → 0.861 |
| `library` `multi` (16) | 0.816 → 0.823 | 0.880 → 0.869 |
| `code` `identifier` (8) | 0.448 → 0.745 | 0.408 → 0.500 |
| `code` `config-key` (7) | 0.612 → 0.692 | 0.456 → 0.508 |
| `code` `flag` (4) | 0.487 → 0.762 | 0.359 → 0.544 |
| `code` `snippet` (5) | 0.528 → 0.873 | 0.676 → 0.877 |
| `code` `error` (3) | 0.590 → 0.729 | 0.643 → 0.697 |
| `repomap/fenced` `identifier` (8) | 0.148 → 0.607 | 0.597 → 0.741 |

Per query, b0 → B1b: on `library` 20 queries gain more than 0.05 nDCG and 5 lose more than 0.05 in keyword mode (the largest loss q086, −0.157), 16 gain and 5 lose in semantic mode (largest loss −0.079); on `code` 17 gain and 2 lose (−0.088, −0.057) in keyword mode, 10 gain and none loses in semantic mode.

Semantic (hybrid) search is weaker than keyword search on `code` for every build, b0 included (0.494 against 0.530 on b0), so the fenced-code gain is smaller there; it does not regress.

### What a search or curate call hands the agent

`akm search` and `akm curate` with `--detail agent --format json --limit 10` (the eval's own call), every query of `library` (136, with the non-task inputs), `code` (30) and `books` (51), on sandboxed indexes of b0, B1b and B3, keyword and semantic. A hit holds `name`, `ref`, `type`, `path`, `editable`, `description`, `action`, `score` and `estimatedTokens`: no snippet and no content, so B cannot change what one hit costs. The sandbox path in `path` was replaced by a fixed placeholder before counting.

| Set, mode, command | b0 bytes per call (hits) | B1b | B3 | Bytes per hit (b0 / B1b / B3) |
|---|---:|---:|---:|---|
| `code` keyword search | 10,725 (8.6) | 10,914 (8.8) | 10,920 (8.8) | 553 / 550 / 551 |
| `code` keyword curate | 12,495 (8.6) | 12,709 (8.8) | 12,710 (8.8) | 614 / 611 / 611 |
| `code` semantic search | 12,284 (10.0) | 12,277 (10.0) | 12,287 (10.0) | 545 / 545 / 545 |
| `code` semantic curate | 14,319 (10.0) | 14,310 (10.0) | 14,323 (10.0) | 604 / 604 / 605 |
| `library` keyword search | 12,095 (9.9) | 12,115 (9.9) | 12,142 (9.9) | 543 / 543 / 544 |
| `library` keyword curate | 13,914 (9.5) | 13,941 (9.5) | 13,970 (9.5) | 621 / 622 / 623 |
| `library` semantic search | 12,239 (10.0) | 12,236 (10.0) | 12,266 (10.0) | 543 / 542 / 544 |
| `library` semantic curate | 14,127 (9.6) | 14,125 (9.6) | 14,152 (9.6) | 623 / 622 / 624 |
| `books`, all four | identical on all three builds (9,328 / 11,440 / 10,051 / 12,276) | | | 431–512 |

So B1b hands the agent the same ~3,000 tokens per call as b0; the only change is that `code` keyword calls on b0 sometimes return fewer than 10 hits. B3 is the same. What changes is which assets come first, and with them the follow-up `show` an agent makes, whose cost is each hit's own `estimatedTokens` and does not depend on the build.

### Index cost (`corpus/library`, 251 assets, sandboxed `akm index --full` per build)

| akm | `index.db`, keyword | vs b0 | `index.db`, semantic | vs b0 |
|---|---:|---:|---:|---:|
| b0 | 2,760,704 B | | 3,276,800 B | |
| B1 | 3,031,040 B | +9.8% | 3,547,136 B | +8.3% |
| B1b | 3,051,520 B | +10.5% | 3,567,616 B | +8.9% |
| B3 | 3,129,344 B | +13.4% | 3,645,440 B | +11.3% |

Single measurements while label runs shared the machine; index times are not compared. The keyword b0 index is 2.76 MB here against 2.79 MB in phase 2 (a different host and SQLite page use); the ratios agree within about 1.5 points.

### The constraints B must keep

- **No secret or env bytes.** A probe note with fenced `export PRIVATE_TOKEN=abc123zzqv`, a `Bearer sk-live-…` header, a URL with a password, `API_KEY="ghp_…"`, a JSON `"password": "s3cr3tvalue"` and `process.env.DEPLOY_TOKEN`, indexed semantically on each build, then a byte search of `index.db` (case-insensitive, also for fragments of each token): b0 holds none of it; **B1b holds no value** (no `abc123`, `sk-live`, `hunter2`, `ghp_`/`zx81qw92`, `s3cr3t`, `example.com`, `bearer`) but holds the names `PRIVATE_TOKEN` and `DEPLOY_TOKEN`; B3 holds every value. The names are what today's three projection tests forbid ("no fenced bytes, names included"), so adopting B1b changes that documented contract to "no fenced literal values". The probe also showed B1b dropping a call on an assignment's right side (`client = createDeployClient(…)` loses `createDeployClient`): the dotted-reference rule keeps `a.b.c` values only. That is a recall gap of B1b, not a safety one.
- **Fragments, fragment ids and `show`.** `entry_fragments.safe_markdown` of `corpus/library` hashes the same on all four builds (194 fragments, 704,414 characters). Fragment ids are hashes of that text, so they are unchanged. `akm show <ref>` of four fenced assets and `akm show <ref>#<slug>` with `--context exact` and `--context lead` for the first four sections of five fenced assets (40 reads): b0 and B1b byte-identical, no errors.
- **Semantic regression, and B1c.** The runbook's B1c (fence tokens in a separate low-weight FTS column, out of the embedding text) was to be measured only if semantic search regressed. It did not: B1b's semantic `code` gain is +0.120 nDCG, `library` semantic +0.015, `books` identical. No `spike/1260-b1c` branch was made.

## Part A: the agent-ab repomap tasks

Built and checked as the runbook says (`evals/agent-ab/cases/repomap`, 7 tasks; oracle 7/7, nop 0/7), then run once on b0. **This run does not answer question A.**

**What happened.** The b0 run completed (`private/agent-ab/results/2026-10-27-repomap-b0/`, `status: "complete"`, 42 of 42 trials, 36 completed and 6 failed by opencode's exit or the gateway's 500). But 24 of the 42 trials hit the 35B server's context limit: the trial's own `opencode.log` holds `"Context size has been exceeded."` (a 500 from the server through the gateway) in **15 of 21 akm-arm trials (66 such errors) and 9 of 21 control trials (39 errors)**. The arms run at the `models.json` window of 32,768 tokens; the largest prompt that a trajectory recorded is 30,338 tokens (akm) and 27,921 (control), and the failed requests themselves are not recorded. The akm arm starts every session about 2,400 tokens larger (first prompt about 9,600 against 7,180 tokens: the plugin's hints), which leaves it less room. In addition, **no akm-arm agent called akm** (0 of 21 trials, no plugin tool and no `akm` in the shell) **or read the curated results the plugin wrote** (0 of 21): the agents searched the repository with glob, grep and read, as the control does. So the arms differ only by the plugin's start-up context, and the map was never fetched.

For the record only, not as evidence about the map:

| Arm (b0, 21 trials each) | Pass rate | Trials with a context overflow | akm called | Curated read | Input tokens / trial | Output tokens / trial | Tool calls / trial | Agent minutes / trial |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| control | 0.667 | 9 | — | — | 59,292 | 355 | 4.8 | 2.5 |
| akm | 0.619 | 15 | 0 | 0 | 74,197 | 413 | 5.9 | 4.0 |

Two task verifiers were also too strict, found by reading the failed answers: `repomap--npm-integrity` accepted only `src/core/npm-package.ts verifyIntegrity`, but `src/sources/providers/tar-utils.ts verifyArchiveIntegrity` is the npm source's check of the downloaded tarball against its SRI hash and answers the instruction as well; `repomap--markdown-fragments` accepted only `splitMarkdownFragments`, a wrapper of `splitMarkdownFragmentStats`, which does the split. Re-verified with both answers allowed, the b0 pass rates are 0.810 (control) and 0.714 (akm). The tasks are corrected in version 1.1.0 (oracle 7/7, nop 0/7 again); the b0 run used 1.0.0.

**The B1b run.** It was not to be started once the overflow was known. The driver had already started it after b0 finished (16:31 UTC), before that instruction reached me; it was stopped on the owner's instruction (Harbor exit 130) with 30 of 42 trials done and 12 missing, `status: "aborted"` (`private/agent-ab/results/2026-10-27-repomap-b1b/`). It has the same picture (11 of 30 trials overflowed, akm called in 0 of 13 scored akm trials) and is no result.

**Why the map sizes matter for a valid run.** The akm arm never fetched the map here, so its size did not cause these overflows. But one fetch would: the map assets are `commands` 121,527 B (about 30k tokens), `core` 74,811 B, and `workflows`, `sources`, `indexer`, `storage` and `tasks` 26–31 KB each, so a single `akm show` of the asset an agent needs most can fill or exceed the 32,768-token window.

### Options for a valid A measurement (not run; the coordinator and owner choose)

Per the owner's rule, only options that make the agent read less. A larger model window is not one: it would make room for a flood, which is the failed design. Sizes are of what the agent would read, measured on the inline map at `f8f97704` (650 file sections in 14 directory assets plus `src`), tokens as bytes ÷ 4.

| Option | What the agent reads | Size per read | What it takes |
|---|---|---|---|
| 1. Split the map so no asset is large | One asset per directory at any depth (`src/commands/read`, `src/core/asset`, …), and a directory over a bound such as 8 KB split per file, cut from the same `repomix` pack by a documented change to the jq one-liner in `evals/retrieval/assets/repomap/README.md` (group by full directory instead of top-level directory) | 81 directory sections today: median 3,464 B (~870 tokens), 90th percentile 11,004 B (~2,750), largest 34,681 B (~8,700); with the 8 KB bound every asset is under ~2,000 tokens. Search hits stay ~545 B each | Regenerate the fixture (no generator script, the command only), copy it into `cases/repomap/libraries`, re-grade the retrieval `repomap` set (more, smaller assets: new qrels, about 15 minutes of judge time; earlier `repomap` runs no longer compare), two agent-ab runs on the 35B (about 50 minutes each) |
| 2. One section at a time from today's assets | `akm show <ref> --detail brief` (the `toc` that `f8f97704` returns) then `akm show <ref>#<slug>` for one file's `###` section | A file section: median 376 B (~94 tokens), largest 5,276 B (~1,300); one measured `show <ref>#<slug>` printed 639 to 1,675 B. But the `toc` of a large asset is itself large: 28,456 B (~7,100 tokens) for `commands`, 21,517 B for `core`, 1,619 B for `cli` | No akm-eval change. Nothing in the task may tell the agent to do it (the task checks forbid nudges), and in this run no agent called akm at all, so it depends on the plugin's hints and would likely measure engagement. Combined with option 1 the `toc` shrinks with the asset |
| 3. A compact outline asset beside the map | One small asset that lists directories (and optionally file paths) with no symbols, to pick the directory or file, then a section or a small asset of option 1 for the symbols | Directories only: 1,865 B (~470 tokens); every file path: 23,115 B (~5,800 tokens), so directories only, or file paths per top-level directory | A second fixture from the same pack (a jq one-liner, documented), one more knowledge asset in the library; same re-grade and runs as option 1 |

Options 1 and 3 together keep every read under about 2,000 tokens. Whichever is chosen, read engagement first: a run where the agent never calls akm cannot say whether the map helps. The control also overflowed in 9 of 21 trials at this window (its glob and grep over the 22 MB repository), which a valid run should report next to the akm arm's figures.

## What changed in akm-eval (branch `spike/1260-full-system`)

- `evals/retrieval/label`: a `--cases` set whose `library/` is copied whole is now listed like the public library, so its pool has the BM25 and the expected assets and `--from` grades every result of a run. Before, `label --cases evals/retrieval/assets/code` stopped at once ("c01 expects …, which is not an asset akm indexes … the own library is not listed"), and `--from` kept only results that keyword search returned at labelling time, so semantic results could not be graded. A second fix: an expected ref that akm no longer indexes stops the run only when the qrels do not grade it already; the public q092 expects a `commands/` ref that akm 0.10 prints as knowledge, which stopped label of the public library on every 0.10 build. Both are deviations from the runbook forced by the tool, recorded in `MEASUREMENT_CHANGELOG.md` (no version change).
- New grades: `code`, `repomap`, `repomap/fenced` by the judge; the `library` expansion; retrieval `scoringVersion` 0.4.
- agent-ab: the `cases/repomap` task family (7 tasks, the inline map as the library), with the existing task checks of `src/lib.test.ts` run on it too. `-a oracle` scored 7 of 7 (mean 1.000) and `-a nop` 0 of 7 (mean 0.000) before any model run, and again after two verifiers were corrected (1.1.0).
- agent-ab and terminal-bench summaries: per-arm means per scored trial of `input_tokens`, `output_tokens` and `tool_calls` (the pre-approved additive extension; the summary had token totals only).

## Published runs

`retrieval/2026-10-27-<build>-sem-<set>-own-rescored` for `code`, `repomap` and `repomap-fenced` of all four builds, and `retrieval/2026-10-27-b0-sem-{library,books}-rescored` (`summary.json` and `samples.jsonl`). As in phases 1–2, the prototypes' public-collection runs are not published: their numbers are in the tables, and the commands reproduce them. The agent-ab runs are not published: they do not measure the map. They stay in akm-eval-private (`agent-ab/results/2026-10-27-repomap-b0`, complete, and `-b1b`, aborted), with every trial folder.

## Did not run, and limits

- **B1c**: not needed (no semantic regression).
- **`books` grading**: not graded, as above; it cannot move a build comparison.
- **Question A**: not answered (see Part A). The B1b agent-ab run was stopped and is no result.
- **The optional B end-to-end agent-ab family** (answers only in fenced code): not built; the runbook marks it optional.
- **One run per measurement.** Keyword runs are deterministic; semantic runs are deterministic for a build and library; agent-ab is one run of 3 attempts per task and arm, so task-level differences of one attempt are noise.
- **The judge.** One judge model, the same model the agent-ab arms use. It cannot see past 16,000 characters, which cost `c18`, and it grades more generously than the provisional review.
- **Recorded commit.** The b0 public run's `library` summary records `777c990-dirty` and its `books` summary `902b662`: an unrelated `lib/harbor` commit landed while it ran. No retrieval file differed.
