import type { ComparisonReport, NormalizedRunResult } from "../core/types.ts";

/**
 * Renders a metric a pack did not compute as `n/a` rather than a number, so a
 * reader can never mistake "not measured" for "measured zero". Mirrors the
 * `?? "-"` treatment the nullable cost/latency columns already get below.
 */
function metricValue(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function metadataValue(result: NormalizedRunResult, key: string): string | null {
  const value = result.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function markdownReportForResult(result: NormalizedRunResult): string {
  return [
    `# Result: ${result.runId}`,
    "",
    `- Pack: ${result.pack}`,
    `- Variant: ${result.variant}`,
    `- Model: ${metadataValue(result, "model") ?? "-"}`,
    `- Memory backend: ${result.memoryBackend}`,
    `- Status: ${result.status}`,
    `- Aggregate score: ${result.metrics.aggregate.score.toFixed(3)}`,
    "",
    "## Notes",
    "",
    // `notes` is where adapters put the caveats a reader must see alongside
    // the score itself — retrieval-ceiling disclosures included. It was
    // collected into `result.json` but never rendered here before; a reader
    // of summary.md alone had no way to see it.
    ...(result.notes.length > 0 ? result.notes.map((note) => `- ${note}`) : ["- none"]),
    "",
    "## Retrieval metrics",
    "",
    `- query count: ${result.metrics.retrieval.queryCount}`,
    `- precision@k: ${result.metrics.retrieval.precisionAtK}`,
    `- recall@k: ${result.metrics.retrieval.recallAtK}`,
    `- mrr: ${result.metrics.retrieval.mrr}`,
    `- ndcg@k: ${result.metrics.retrieval.ndcgAtK}`,
    "",
    "## Answer metrics",
    "",
    `- exact match: ${metricValue(result.metrics.answer.exactMatch)}`,
    `- token f1: ${metricValue(result.metrics.answer.tokenF1)}`,
    `- contains expected: ${metricValue(result.metrics.answer.containsExpected)}`,
    `- judged pass: ${metricValue(result.metrics.answer.judgedPass)}`,
    "",
    "## Warnings",
    "",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}

export function markdownReportForComparison(report: ComparisonReport): string {
  return [
    `# Comparison: ${report.baselineRunId} -> ${report.candidateRunId}`,
    "",
    `- Outcome: ${report.outcome}`,
    `- Absolute score delta: ${report.absoluteScoreDelta}`,
    `- Relative score delta: ${report.relativeScoreDelta ?? "-"}`,
    `- Cost delta (USD): ${report.costDeltaUsd ?? "-"}`,
    `- Latency delta (ms): ${report.latencyDeltaMs ?? "-"}`,
    `- Baseline success per dollar: ${report.baselineSuccessPerDollar ?? "-"}`,
    `- Candidate success per dollar: ${report.candidateSuccessPerDollar ?? "-"}`,
    `- Baseline success per minute: ${report.baselineSuccessPerMinute ?? "-"}`,
    `- Candidate success per minute: ${report.candidateSuccessPerMinute ?? "-"}`,
    "",
    "## Metric deltas",
    "",
    "| Metric | Baseline | Candidate | Delta |",
    "| --- | ---: | ---: | ---: |",
    ...report.metricDeltas.map(
      (metric) =>
        `| ${metric.metric} | ${metricValue(metric.baseline)} | ${metricValue(metric.candidate)} | ${metricValue(metric.delta)} |`,
    ),
    "",
    "## Warnings",
    "",
    // Carried over from each run's own result.json so a reader of the
    // comparison alone (not just each run's individual summary.md) sees
    // caveats -- e.g. a full-haystack-vs-retrieved-only asymmetry between the
    // two compared arms -- rather than only the numeric deltas above.
    ...(report.baselineWarnings.length > 0 || report.candidateWarnings.length > 0
      ? [
          ...(report.baselineWarnings.length > 0
            ? [
                `### Baseline (${report.baselineRunId})`,
                "",
                ...report.baselineWarnings.map((warning) => `- ${warning}`),
                "",
              ]
            : []),
          ...(report.candidateWarnings.length > 0
            ? [
                `### Candidate (${report.candidateRunId})`,
                "",
                ...report.candidateWarnings.map((warning) => `- ${warning}`),
                "",
              ]
            : []),
        ]
      : ["- none"]),
  ].join("\n");
}
