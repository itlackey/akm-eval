# reports

Published public results of the evals, and notes. Raw benchmark datasets and Harbor job directories are kept out of this tree.

- [`repomap-codeblocks-2026-10-27/README.md`](repomap-codeblocks-2026-10-27/README.md): work in progress, phases 1–2 of akm#1260 (keyword-only, provisional grades): the b0 baseline of akm `release/0.10.0` at `f8f97704` on `library`, `books` and the new `code` and `repomap` sets, and the fenced-code prototypes B1, B2, B3 and B1b. Recommends B1b for part B, pending the semantic, real-judge and agent-ab runs in its [runbook](repomap-codeblocks-2026-10-27/finish-on-full-system.md); part A is undecided.
- [`flint-don-2026-10-25/README.md`](flint-don-2026-10-25/README.md): Flint on Apple M4 Pro with AKM 0.10.261011-beta; full GGUF bakeoff, pilots, official rec INT4 diagnostics, and a [full 55-case rec capture](flint-don-2026-10-25/rec/budget-run.md) with explicit completion budgets, raw outputs and native timing counters. Earlier preflight/budget failures remain preserved.
- [`no-change-132-2026-10-21/README.md`](no-change-132-2026-10-21/README.md): bakeoff 0.3 scores memory inference's explicit no-change decision; a paired 19-case Flash-Next pilot of the 0.2 and 0.3 harnesses on one akm `release/0.10.0` build (no model-quality claim), with the remaining scope and date cases.
- [`memory-lifecycle-125/README.md`](memory-lifecycle-125/README.md): manual, opt-in real-akm checks that memory claims, evidence and scopes survive extraction, acceptance, improvement and recall; all 12 pass on akm `release/0.10.0` at `d2369845a`.
- [`flash-json-fix-2026-10-21/README.md`](flash-json-fix-2026-10-21/README.md): follow-up to the comparison below; the observed Flash-Next JSON failure fixed in the model server, and two full reruns at 35/40 and 36/40 with no failed model calls, with the replay evidence and limits.
- [`flash-next-vs-35b-2026-10-21/README.md`](flash-next-vs-35b-2026-10-21/README.md): matched 40-case bakeoff on AKM 0.10.261005-beta; Flash-Next 34/40 versus a fresh 35B baseline 27/40, with timing, failed calls and per-process results retained. Superseded for Flash-Next by the follow-up above.

- [`0.10.261012-beta/README.md`](0.10.261012-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.10.261011-beta; distill 25/40 with no wrong lesson after #1241.
- [`0.10.261011-beta-flash/README.md`](0.10.261011-beta-flash/README.md): the 10 model-dependent evals on Flash-Next (`moe/qwen3.8-flash-next-iq2_xs`) with akm 0.10.261011-beta, next to the 35B round on that build.
- [`0.10.261011-beta/README.md`](0.10.261011-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to the new 0.9.32 set and 0.10.261010-beta; bakeoff 0.4 on three builds, and the akm changes since 0.10.261010-beta.
- [`0.9.32/README.md`](0.9.32/README.md): the one 0.9.32 set of the 35B (2026-10-22, same settings and eval versions as the 0.10.261011-beta round), plus the single Luna LongMemEval pilot; replaces the 2026-10-15 runs and the 0.9.31 retrieval runs.
- [`0.10.261010-beta/README.md`](0.10.261010-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.10.261009-beta; bakeoff 0.3 on both betas with the no-change outcomes apart.
- [`0.10.261009-beta/README.md`](0.10.261009-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.9.32 and 0.10.261006-beta.
- [`0.10.261006-beta/README.md`](0.10.261006-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.10.261005-beta.
- [`0.9.32-vs-0.10.261005-beta/README.md`](0.9.32-vs-0.10.261005-beta/README.md): superseded note; the 2026-10-15 0.9.32 runs it compared were replaced by the new 0.9.32 set (full text in git history).
- [`validation-2026-10-14/README.md`](validation-2026-10-14/README.md): Docker validation, 35B Reflect rescore and expanded-label semantic retrieval results.
- [`0.10.261003-beta/longmemeval/luna-semantic-fresh-20261014-full/README.md`](0.10.261003-beta/longmemeval/luna-semantic-fresh-20261014-full/README.md): fresh full Luna semantic LongMemEval run; 500 attempted, 499 scored pairs, limitations retained.
- [`0.10.261003-beta/semantic-2026-10-14/README.md`](0.10.261003-beta/semantic-2026-10-14/README.md): semantic 35B/Luna results, completed artifacts, and stopped benchmark coverage.
- [`retired-evals.md`](retired-evals.md): what the retired evals asked, found and why they ended.
- [`0.10.261003-beta/README.md`](0.10.261003-beta/README.md): retrieval controls and links to current model results.

The ledger lists every published run. The current matched release comparison is linked above; the table below records earlier collections. Corrected rescores replace superseded scoring rows.

Each public run contains its original `summary.json` and `samples.jsonl`. Comparison reads stored scores. Explicit rescoring can use current labels for unchanged inputs and writes a new folder; it never rewrites published artifacts. Custom cases and private outputs are never included.

```sh
scripts/compare/run reports/<version>/<eval>/<run-A> reports/<version>/<eval>/<run-B>
```

| akm | eval | label | corpus | model | what it is |
|---|---|---|---|---|---|
| 0.10.261011-beta | bakeoff | [flint-don-rec-int4-budget-full-20261025](flint-don-2026-10-25/rec/budget-full) | public | flint | full 55-case rec capture; explicit completion budget, remote Qwen3 embeddings; raw metrics, analysis deferred |
| 0.10.261011-beta | bakeoff | [flint-don-rec-int4-budget-pilot-20261025](flint-don-2026-10-25/rec/budget-pilot) | public | flint | 5-case configuration-validation capture |
| 0.10.261011-beta | bakeoff | [flint-don-q4-recommended-full-20261025](flint-don-2026-10-25/recommended-full) | public | flint-q4-k-m | full 55-case run; recommended sampling, remote Qwen3 embeddings; see comparison limits |
| 0.10.261011-beta | bakeoff | [flint-don-q4-pilot-20261025](flint-don-2026-10-25/stock-pilot) | public | flint-q4-k-m | 5-case stock-temperature diagnostic pilot |
| 0.10.261011-beta | bakeoff | [flint-don-q4-recommended-pilot-20261025](flint-don-2026-10-25/recommended-pilot) | public | flint-q4-k-m | 5-case recommended-sampling diagnostic pilot |
| 0.10.261003-beta | longmemeval | [akm-0.10-public](0.10.261003-beta/longmemeval/akm-0.10-public) | public | none | full retrieval-only run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r1-books](0.10.261003-beta/retrieval/akm-0.10-keyword-r1-books) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r1-library](0.10.261003-beta/retrieval/akm-0.10-keyword-r1-library) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r2-books](0.10.261003-beta/retrieval/akm-0.10-keyword-r2-books) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r2-library](0.10.261003-beta/retrieval/akm-0.10-keyword-r2-library) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r3-books](0.10.261003-beta/retrieval/akm-0.10-keyword-r3-books) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-keyword-r3-library](0.10.261003-beta/retrieval/akm-0.10-keyword-r3-library) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-public-r1-books](0.10.261003-beta/retrieval/akm-0.10-public-r1-books) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-public-r2-books](0.10.261003-beta/retrieval/akm-0.10-public-r2-books) | public | none | full public run |
| 0.10.261003-beta | retrieval | [akm-0.10-public-r3-books](0.10.261003-beta/retrieval/akm-0.10-public-r3-books) | public | none | full public run |
| 0.10.261003-beta | skillret | [akm-0.10-public](0.10.261003-beta/skillret/akm-0.10-public) | public | none | full public run |
| 0.10.261003-beta | retrieval | [bifrost-fast35b-v06-20261013-library](0.10.261003-beta/retrieval/bifrost-fast35b-v06-20261013-library) | public | none | full public run; 136 recorded, 136 scored, 0 errors |
| 0.10.261003-beta | retrieval | [bifrost-fast35b-v06-20261013-books](0.10.261003-beta/retrieval/bifrost-fast35b-v06-20261013-books) | public | none | full public run; 51 recorded, 51 scored, 0 errors |
| 0.10.261003-beta | skillret | [bifrost-fast35b-v06-20261013](0.10.261003-beta/skillret/bifrost-fast35b-v06-20261013) | public | none | full public run; 4392 recorded, 4392 scored, 0 errors |
| 0.10.261003-beta | longmemeval | [luna-semantic-fresh-20261014-full](0.10.261003-beta/longmemeval/luna-semantic-fresh-20261014-full) | public | eval-luna/gpt-6-luna | full semantic run; 500 attempted, 499 scored pairs, 1 error; Qwen judge |
| 0.10.261003-beta | reflect | [docker-35b-semantic-full-20261014-rescored](0.10.261003-beta/reflect/docker-35b-semantic-full-20261014-rescored) | public | fast/qwen3.6-35b-a3b | 80 cases; explicit rescore |
| 0.10.261003-beta | retrieval | [docker-semantic-full-20261014-books-rescored](0.10.261003-beta/retrieval/docker-semantic-full-20261014-books-rescored) | public | none | 51 cases; expanded-label rescore |
| 0.10.261003-beta | retrieval | [docker-semantic-full-20261014-library-rescored](0.10.261003-beta/retrieval/docker-semantic-full-20261014-library-rescored) | public | none | 136 cases; expanded-label rescore |
| 0.10.261003-beta | agent-ab | [b35-semantic-20261014-pilot](0.10.261003-beta/semantic-2026-10-14/agent-ab/2026-10-14-b35-semantic-20261014-pilot) | public | openai/fast/qwen3.6-35b-a3b | semantic pilot; full collection incomplete |
| 0.10.261003-beta | bakeoff | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/bakeoff/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | consolidate | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/consolidate/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | distill | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/distill/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | extract | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/extract/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | judge-gate | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/judge-gate/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | nightly | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/nightly/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | promotion | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/promotion/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | reflect | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/reflect/2026-10-14-b35-semantic-20261014-full) | public | fast/qwen3.6-35b-a3b | full semantic collection |
| 0.10.261003-beta | retrieval | [semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/retrieval/2026-10-14-semantic-20261014-full-books) | public | none | full semantic collection |
| 0.10.261003-beta | retrieval | [semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/retrieval/2026-10-14-semantic-20261014-full-library) | public | none | full semantic collection |
| 0.10.261003-beta | agent-ab | [b35-semantic-20261014-full](0.10.261003-beta/semantic-2026-10-14/stopped/agent-ab) | public | openai/fast/qwen3.6-35b-a3b | stopped partial collection; native completion grid retained |
| 0.10.261003-beta | terminal-bench | [luna-semantic-20261014-pilot](0.10.261003-beta/semantic-2026-10-14/terminal-bench/2026-10-14-luna-semantic-20261014-pilot) | public | openai/eval-luna/gpt-6-luna | semantic pilot; full collection incomplete |
| 0.9.32 | reflect | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/reflect/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | distill | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/distill/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | extract | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/extract/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | judge-gate | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/judge-gate/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | bakeoff | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/bakeoff/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run, bakeoff 0.4 (55 cases) |
| 0.9.32 | consolidate | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/consolidate/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | consolidate | [2026-10-22-0.9.32-35b-semantic-pool-20261022](0.9.32/consolidate/2026-10-22-0.9.32-35b-semantic-pool-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run (`--pool`) |
| 0.9.32 | promotion | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/promotion/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | nightly | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/nightly/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.9.32 | retrieval | [2026-10-22-0.9.32-35b-semantic-full-20261022-books](0.9.32/retrieval/2026-10-22-0.9.32-35b-semantic-full-20261022-books) | public | none | full semantic run |
| 0.9.32 | retrieval | [2026-10-22-0.9.32-35b-semantic-full-20261022-library](0.9.32/retrieval/2026-10-22-0.9.32-35b-semantic-full-20261022-library) | public | none | full semantic run |
| 0.9.32 | skillret | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/skillret/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | none | full semantic run |
| 0.9.32 | agent-ab | [2026-10-22-0.9.32-35b-semantic-full-20261022](0.9.32/agent-ab/2026-10-22-0.9.32-35b-semantic-full-20261022) | public | openai/fast/qwen3.6-35b-a3b | 6 tasks, 3 attempts per arm, semantic |
| 0.10.261011-beta | reflect | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/reflect/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | distill | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/distill/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | extract | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/extract/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | judge-gate | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/judge-gate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | bakeoff | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/bakeoff/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run, bakeoff 0.4 (55 cases) |
| 0.10.261011-beta | consolidate | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/consolidate/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | consolidate | [2026-10-22-0.10.261011-beta-35b-semantic-pool-20261022](0.10.261011-beta/consolidate/2026-10-22-0.10.261011-beta-35b-semantic-pool-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run (`--pool`) |
| 0.10.261011-beta | promotion | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/promotion/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | nightly | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/nightly/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261011-beta | retrieval | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-books](0.10.261011-beta/retrieval/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-books) | public | none | full semantic run |
| 0.10.261011-beta | retrieval | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-library](0.10.261011-beta/retrieval/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022-library) | public | none | full semantic run |
| 0.10.261011-beta | skillret | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/skillret/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | none | full semantic run |
| 0.10.261011-beta | agent-ab | [2026-10-22-0.10.261011-beta-35b-semantic-full-20261022](0.10.261011-beta/agent-ab/2026-10-22-0.10.261011-beta-35b-semantic-full-20261022) | public | openai/fast/qwen3.6-35b-a3b | 6 tasks, 3 attempts per arm, semantic |
| 0.10.261011-beta-flash | reflect | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/reflect/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | distill | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/distill/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | extract | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/extract/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | judge-gate | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/judge-gate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | bakeoff | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/bakeoff/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run, bakeoff 0.4 (55 cases) |
| 0.10.261011-beta-flash | consolidate | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/consolidate/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | consolidate | [2026-10-23-0.10.261011-beta-flash-semantic-pool-20261023](0.10.261011-beta-flash/consolidate/2026-10-23-0.10.261011-beta-flash-semantic-pool-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run (`--pool`) |
| 0.10.261011-beta-flash | promotion | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/promotion/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | nightly | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/nightly/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | moe/qwen3.8-flash-next-iq2_xs | full semantic run |
| 0.10.261011-beta-flash | agent-ab | [2026-10-23-0.10.261011-beta-flash-semantic-full-20261023](0.10.261011-beta-flash/agent-ab/2026-10-23-0.10.261011-beta-flash-semantic-full-20261023) | public | openai/moe/qwen3.8-flash-next-iq2_xs | 6 tasks, 3 attempts per arm, semantic |
| 0.10.261012-beta | reflect | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/reflect/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | distill | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/distill/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | extract | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/extract/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | judge-gate | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/judge-gate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | bakeoff | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/bakeoff/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run, bakeoff 0.4 (55 cases) |
| 0.10.261012-beta | consolidate | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/consolidate/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | consolidate | [2026-10-23-0.10.261012-beta-35b-semantic-pool-20261023](0.10.261012-beta/consolidate/2026-10-23-0.10.261012-beta-35b-semantic-pool-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run (`--pool`) |
| 0.10.261012-beta | promotion | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/promotion/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | nightly | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/nightly/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | fast/qwen3.6-35b-a3b | full semantic run |
| 0.10.261012-beta | retrieval | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-books](0.10.261012-beta/retrieval/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-books) | public | none | full semantic run |
| 0.10.261012-beta | retrieval | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-library](0.10.261012-beta/retrieval/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023-library) | public | none | full semantic run |
| 0.10.261012-beta | skillret | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/skillret/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | none | full semantic run |
| 0.10.261012-beta | agent-ab | [2026-10-23-0.10.261012-beta-35b-semantic-full-20261023](0.10.261012-beta/agent-ab/2026-10-23-0.10.261012-beta-35b-semantic-full-20261023) | public | openai/fast/qwen3.6-35b-a3b | 6 tasks, 3 attempts per arm, semantic |
| 0.9.32 | longmemeval | [2026-10-15-compare-0.9.32-luna-semantic-pilot-20261014](0.9.32/longmemeval/2026-10-15-compare-0.9.32-luna-semantic-pilot-20261014) | public | eval-luna/gpt-6-luna | semantic pilot; the only 0.9.x run for this model |
| 0.10.261010-beta | bakeoff | [2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-rescored](0.10.261010-beta/bakeoff/2026-10-21-0.10.261010-beta-35b-semantic-full-20261021-rescored) | public | fast/qwen3.6-35b-a3b | bakeoff 0.3 run scored again with the 0.4 scorer; 51 cases, no row differs |
