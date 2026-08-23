import type { AnswerMetrics, MemoryDocument, RetrievalMetrics } from "../memory/types.ts";

export interface EvalDefaults {
  outputDir?: string;
  memoryBackend?: string;
}

export interface AgentProviderConfig {
  type: "opencode" | "openai-compatible" | "custom";
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  configPath?: string;
  defaultModel?: string;
  options?: Record<string, unknown>;
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
  agentEnvironment?: Record<string, string>;
  akmEnabled?: boolean;
  akmCommand?: string;
  akmEnvironment?: Record<string, string>;
  akmConfigPath?: string;
  memoryDocuments?: MemoryDocument[];
  retrieval?: RetrievalConfig;
  answer?: AnswerConfig;
  metadata?: Record<string, string | number | boolean | null>;
  /** Optional pack-level config (from packs[].config). */
  packConfig?: Record<string, unknown>;
  /** Optional per-run model override (from variant.agent.model). */
  agentModel?: string;
  /** The provider key declared in top-level providers, if any. */
  agentProvider?: string;
  /** Resolved provider config for execution. */
  agentProviderConfig?: AgentProviderConfig;
}

export interface EvalConfig {
  version: 1;
  defaults?: EvalDefaults;
  runs: RunDefinition[];
  /** Global provider connection configs. */
  providers?: Record<string, AgentProviderConfig>;
}

export interface AggregateMetrics {
  score: number;
  retrievalWeight: number;
  answerWeight: number;
}

export interface NormalizedRunResult {
  schemaVersion: "1.0";
  runId: string;
  pack: string;
  variant: string;
  memoryBackend: string;
  status: "passed" | "failed" | "warning";
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
  outcome: "improved" | "regressed" | "unchanged";
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
  /**
   * Carried over verbatim from each run's own NormalizedRunResult.warnings so
   * a reader of the comparison artifact alone (e.g. `bin/compare` output, or
   * summary.md rendered from markdownReportForComparison) sees caveats like a
   * full-haystack-vs-retrieved-only asymmetry between the two arms, not just
   * the numeric deltas. Without this, a comparison could publish e.g.
   * "Outcome: regressed" with no indication that the baseline had context the
   * candidate structurally cannot have.
   */
  baselineWarnings: string[];
  candidateWarnings: string[];
}
