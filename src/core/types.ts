import type { AnswerMetrics, RetrievalMetrics, MemoryDocument } from '../memory/types.ts';

export interface EvalDefaults {
  outputDir?: string;
  memoryBackend?: string;
}

export interface RetrievalConfig {
  query?: string;
  relevantIds?: string[];
  topK?: number;
}

export interface AnswerConfig {
  expected?: string;
  actual?: string;
}

export interface RunDefinition {
  id?: string;
  pack: string;
  variant: string;
  outputDir?: string;
  memoryBackend?: string;
  memoryDocuments?: MemoryDocument[];
  retrieval?: RetrievalConfig;
  answer?: AnswerConfig;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EvalConfig {
  version: 1;
  defaults?: EvalDefaults;
  runs: RunDefinition[];
}

export interface AggregateMetrics {
  score: number;
  retrievalWeight: number;
  answerWeight: number;
}

export interface NormalizedRunResult {
  schemaVersion: '1.0';
  runId: string;
  pack: string;
  variant: string;
  memoryBackend: string;
  status: 'passed' | 'failed' | 'warning';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  warnings: string[];
  notes: string[];
  metrics: {
    retrieval: RetrievalMetrics;
    answer: AnswerMetrics;
    aggregate: AggregateMetrics;
  };
  telemetry: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    latencyMs: number;
    logs: string[];
  };
  artifacts: {
    resultPath: string;
    summaryPath: string;
    rawOutputPath?: string;
  };
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ComparisonMetricDelta {
  metric: string;
  baseline: number;
  candidate: number;
  delta: number;
}

export interface ComparisonReport {
  baselineRunId: string;
  candidateRunId: string;
  outcome: 'improved' | 'regressed' | 'unchanged';
  scoreDelta: number;
  absoluteScoreDelta: number;
  relativeScoreDelta: number | null;
  costDeltaUsd: number | null;
  latencyDeltaMs: number | null;
  baselineSuccessPerDollar: number | null;
  candidateSuccessPerDollar: number | null;
  baselineSuccessPerMinute: number | null;
  candidateSuccessPerMinute: number | null;
  failureCategoryChanges: string[];
  metricDeltas: ComparisonMetricDelta[];
}
