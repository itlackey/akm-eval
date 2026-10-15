# Retired comparison results

66 published rows are retired; 35 active rows remain in the ledger and report index. Their original
summaries, samples, scores and diagnostic files remain unchanged at the same paths.
The [retirement list](retired-results.json) names every published folder and its
reason. It affects publication only; explicitly comparing saved folders still works.
No eval or model call was run for this cleanup.

- Rejected non-semantic model collections: the earlier Qwen 27B and 35B batches,
  including deterministic candidate embeddings, are historical evidence. Use the
  [native-semantic process collections](0.10.261003-beta/semantic-2026-10-14/README.md).
- Setup-only failures, the broken-plugin GPT-120 pilot and tiny GPT-120 demonstrations
  do not establish quality. Original failures remain available for diagnosis.
  Setup-only local runs and the cancelled keyword-only LongMemEval prefixes were
  never published and remain outside the active set; do not publish them as quality rows.
- Process pilots replaced by full semantic runs, and the 20-question LongMemEval
  pilot and stopped 362-question prefix, are retired. Use the
  [full Luna semantic collection](0.10.261003-beta/longmemeval/luna-semantic-fresh-20261014-full/README.md),
  including its API error, output-limit and judge-consistency limitations. The local
  five-question readiness check and fresh 20-question pilot are also superseded;
  they remain unpublished.
- The eight three-case Reflect matrix demonstration rows are historical. The
  [old recipe and decision](0.10.261003-beta/README.md) are not an active workflow.
- Seven original scoring rows with published corrected/expanded-label rescores are
  retired. Use the [Reflect and retrieval rescores](validation-2026-10-14/README.md)
  and [rescored 0.9.31 build validations](0.9.31/README.md). A rescore is the same
  collection under corrected scoring, not another independent run or a build improvement.

Valid 0.9 results and deliberate keyword-only retrieval controls are retained.
Semantic Agent A/B and Terminal-Bench pilots remain active with pilot scope because
no full collection completed. The stopped Agent A/B snapshot remains Diagnostic;
Terminal-Bench setup failures remain in the stopped inventory, not quality rows.
Negative findings in completed semantic runs, including unsafe consolidation,
extracted planted instructions and LongMemEval's accuracy loss, remain visible.
