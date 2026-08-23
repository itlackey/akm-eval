import type {
  ComparisonMetricDelta,
  ComparisonReport,
  NormalizedRunResult,
} from "../core/types.ts";

function collectMetricDeltas(
  baseline: NormalizedRunResult,
  candidate: NormalizedRunResult,
): ComparisonMetricDelta[] {
  const pairs: Array<[string, number, number]> = [
    ["aggregate.score", baseline.metrics.aggregate.score, candidate.metrics.aggregate.score],
    [
      "retrieval.precisionAtK",
      baseline.metrics.retrieval.precisionAtK,
      candidate.metrics.retrieval.precisionAtK,
    ],
    [
      "retrieval.recallAtK",
      baseline.metrics.retrieval.recallAtK,
      candidate.metrics.retrieval.recallAtK,
    ],
    ["retrieval.mrr", baseline.metrics.retrieval.mrr, candidate.metrics.retrieval.mrr],
    ["retrieval.ndcgAtK", baseline.metrics.retrieval.ndcgAtK, candidate.metrics.retrieval.ndcgAtK],
    ["answer.exactMatch", baseline.metrics.answer.exactMatch, candidate.metrics.answer.exactMatch],
    ["answer.tokenF1", baseline.metrics.answer.tokenF1, candidate.metrics.answer.tokenF1],
    [
      "answer.containsExpected",
      baseline.metrics.answer.containsExpected,
      candidate.metrics.answer.containsExpected,
    ],
    ["answer.judgedPass", baseline.metrics.answer.judgedPass, candidate.metrics.answer.judgedPass],
  ];

  return pairs.map(([metric, base, next]) => ({
    metric,
    baseline: base,
    candidate: next,
    delta: Number((next - base).toFixed(6)),
  }));
}

export function compareResults(
  baseline: NormalizedRunResult,
  candidate: NormalizedRunResult,
): ComparisonReport {
  const metricDeltas = collectMetricDeltas(baseline, candidate);
  const scoreDelta = Number(
    (candidate.metrics.aggregate.score - baseline.metrics.aggregate.score).toFixed(6),
  );
  const relativeScoreDelta =
    baseline.metrics.aggregate.score === 0
      ? null
      : Number((scoreDelta / baseline.metrics.aggregate.score).toFixed(6));
  const costDeltaUsd = Number(
    (candidate.telemetry.estimatedCostUsd - baseline.telemetry.estimatedCostUsd).toFixed(6),
  );
  const latencyDeltaMs = Number(
    (candidate.telemetry.latencyMs - baseline.telemetry.latencyMs).toFixed(6),
  );
  const baselineSuccessPerDollar =
    baseline.telemetry.estimatedCostUsd === 0
      ? null
      : Number((baseline.metrics.aggregate.score / baseline.telemetry.estimatedCostUsd).toFixed(6));
  const candidateSuccessPerDollar =
    candidate.telemetry.estimatedCostUsd === 0
      ? null
      : Number(
          (candidate.metrics.aggregate.score / candidate.telemetry.estimatedCostUsd).toFixed(6),
        );
  const baselineSuccessPerMinute =
    baseline.telemetry.latencyMs === 0
      ? null
      : Number(
          (baseline.metrics.aggregate.score / (baseline.telemetry.latencyMs / 60000)).toFixed(6),
        );
  const candidateSuccessPerMinute =
    candidate.telemetry.latencyMs === 0
      ? null
      : Number(
          (candidate.metrics.aggregate.score / (candidate.telemetry.latencyMs / 60000)).toFixed(6),
        );
  return {
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    outcome: scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "regressed" : "unchanged",
    scoreDelta,
    absoluteScoreDelta: scoreDelta,
    relativeScoreDelta,
    costDeltaUsd,
    latencyDeltaMs,
    baselineSuccessPerDollar,
    candidateSuccessPerDollar,
    baselineSuccessPerMinute,
    candidateSuccessPerMinute,
    failureCategoryChanges: [],
    metricDeltas,
    baselineWarnings: baseline.warnings,
    candidateWarnings: candidate.warnings,
  };
}
