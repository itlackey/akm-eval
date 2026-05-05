import type { ComparisonReport, NormalizedRunResult } from '../core/types.ts';

export function markdownReportForResult(result: NormalizedRunResult): string {
  return [
    `# Result: ${result.runId}`,
    '',
    `- Pack: ${result.pack}`,
    `- Variant: ${result.variant}`,
    `- Memory backend: ${result.memoryBackend}`,
    `- Status: ${result.status}`,
    `- Aggregate score: ${result.metrics.aggregate.score.toFixed(3)}`,
    '',
    '## Retrieval metrics',
    '',
    `- precision@k: ${result.metrics.retrieval.precisionAtK}`,
    `- recall@k: ${result.metrics.retrieval.recallAtK}`,
    `- mrr: ${result.metrics.retrieval.mrr}`,
    `- ndcg@k: ${result.metrics.retrieval.ndcgAtK}`,
    '',
    '## Answer metrics',
    '',
    `- exact match: ${result.metrics.answer.exactMatch}`,
    `- token f1: ${result.metrics.answer.tokenF1}`,
    `- contains expected: ${result.metrics.answer.containsExpected}`,
    `- judged pass: ${result.metrics.answer.judgedPass}`,
    '',
    '## Warnings',
    '',
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ['- none']),
    '',
  ].join('\n');
}

export function markdownReportForComparison(report: ComparisonReport): string {
  return [
    `# Comparison: ${report.baselineRunId} -> ${report.candidateRunId}`,
    '',
    `- Outcome: ${report.outcome}`,
    `- Absolute score delta: ${report.absoluteScoreDelta}`,
    `- Relative score delta: ${report.relativeScoreDelta ?? '-'}`,
    `- Cost delta (USD): ${report.costDeltaUsd ?? '-'}`,
    `- Latency delta (ms): ${report.latencyDeltaMs ?? '-'}`,
    `- Baseline success per dollar: ${report.baselineSuccessPerDollar ?? '-'}`,
    `- Candidate success per dollar: ${report.candidateSuccessPerDollar ?? '-'}`,
    `- Baseline success per minute: ${report.baselineSuccessPerMinute ?? '-'}`,
    `- Candidate success per minute: ${report.candidateSuccessPerMinute ?? '-'}`,
    '',
    '## Metric deltas',
    '',
    '| Metric | Baseline | Candidate | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...report.metricDeltas.map(
      (metric) => `| ${metric.metric} | ${metric.baseline} | ${metric.candidate} | ${metric.delta} |`,
    ),
    '',
  ].join('\n');
}
