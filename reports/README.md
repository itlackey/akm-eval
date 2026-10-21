# reports

Published public results of the evals, and notes. Raw benchmark datasets and Harbor job directories are kept out of this tree.

- [`no-change-132-2026-10-21/README.md`](no-change-132-2026-10-21/README.md): bakeoff 0.3 scores memory inference's explicit no-change decision; a paired 19-case Flash-Next pilot of the 0.2 and 0.3 harnesses on one akm `release/0.10.0` build (no model-quality claim), with the remaining scope and date cases.
- [`memory-lifecycle-125/README.md`](memory-lifecycle-125/README.md): manual, opt-in real-akm checks that memory claims, evidence and scopes survive extraction, acceptance, improvement and recall; all 12 pass on akm `release/0.10.0` at `d2369845a`.
- [`flash-json-fix-2026-10-21/README.md`](flash-json-fix-2026-10-21/README.md): follow-up to the comparison below; the observed Flash-Next JSON failure fixed in the model server, and two full reruns at 35/40 and 36/40 with no failed model calls, with the replay evidence and limits.
- [`flash-next-vs-35b-2026-10-21/README.md`](flash-next-vs-35b-2026-10-21/README.md): matched 40-case bakeoff on AKM 0.10.261005-beta; Flash-Next 34/40 versus a fresh 35B baseline 27/40, with timing, failed calls and per-process results retained. Superseded for Flash-Next by the follow-up above.

- [`0.10.261009-beta/README.md`](0.10.261009-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.9.32 and 0.10.261006-beta.
- [`0.10.261006-beta/README.md`](0.10.261006-beta/README.md): every eval but LongMemEval and Terminal-Bench on the 35B with semantic search, full public sets, next to 0.10.261005-beta.
- [`0.9.32-vs-0.10.261005-beta/README.md`](0.9.32-vs-0.10.261005-beta/README.md): matched semantic retrieval, eight full 35B process pairs, full SkillRet for both versions, six-task Agent A/B, warm timing and bounded Luna pilots; larger cloud collections held.
- [`validation-2026-10-14/README.md`](validation-2026-10-14/README.md): Docker validation, 35B Reflect rescore and expanded-label semantic retrieval results.
- [`0.9.31/README.md`](0.9.31/README.md): bounded comparisons between two clean source builds, with expanded-label results.
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
| 0.9.31 | retrieval | [cleanup-build-baseline-20261014-books-rescored](0.9.31/retrieval/cleanup-build-baseline-20261014-books-rescored) | public | none | 12 cases; expanded-label rescore |
| 0.9.31 | retrieval | [cleanup-build-baseline-20261014-library-rescored](0.9.31/retrieval/cleanup-build-baseline-20261014-library-rescored) | public | none | 12 cases; expanded-label rescore |
| 0.9.31 | retrieval | [cleanup-build-candidate-20261014-books-rescored](0.9.31/retrieval/cleanup-build-candidate-20261014-books-rescored) | public | none | 12 cases; expanded-label rescore |
| 0.9.31 | retrieval | [cleanup-build-candidate-20261014-library-rescored](0.9.31/retrieval/cleanup-build-candidate-20261014-library-rescored) | public | none | 12 cases; expanded-label rescore |
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
