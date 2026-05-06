import fs from 'node:fs';
import path from 'node:path';
import type { NormalizedRunResult } from '../core/types.ts';

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function validateNormalizedResult(value: unknown): value is NormalizedRunResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const result = value as Record<string, unknown>;
  if (result.schemaVersion !== '1.0') {
    return false;
  }
  if (
    typeof result.runId !== 'string' ||
    typeof result.pack !== 'string' ||
    typeof result.variant !== 'string' ||
    typeof result.memoryBackend !== 'string' ||
    (result.status !== 'passed' && result.status !== 'failed' && result.status !== 'warning') ||
    typeof result.startedAt !== 'string' ||
    typeof result.finishedAt !== 'string' ||
    !isNumber(result.durationMs) ||
    !isStringArray(result.warnings) ||
    !isStringArray(result.notes)
  ) {
    return false;
  }
  if (typeof result.metrics !== 'object' || result.metrics === null) {
    return false;
  }
  const metrics = result.metrics as Record<string, unknown>;
  const retrieval = metrics.retrieval as Record<string, unknown> | null;
  const answer = metrics.answer as Record<string, unknown> | null;
  const aggregate = metrics.aggregate as Record<string, unknown> | null;
  if (
    !retrieval ||
    !answer ||
    !aggregate ||
    !isNumber(retrieval.queryCount) ||
    !isNumber(retrieval.precisionAtK) ||
    !isNumber(retrieval.recallAtK) ||
    !isNumber(retrieval.mrr) ||
    !isNumber(retrieval.ndcgAtK) ||
    !isNumber(answer.exactMatch) ||
    !isNumber(answer.tokenF1) ||
    !isNumber(answer.containsExpected) ||
    !isNumber(answer.judgedPass) ||
    !isNumber(aggregate.score) ||
    !isNumber(aggregate.retrievalWeight) ||
    !isNumber(aggregate.answerWeight)
  ) {
    return false;
  }
  if (typeof result.telemetry !== 'object' || result.telemetry === null) {
    return false;
  }
  const telemetry = result.telemetry as Record<string, unknown>;
  if (
    !isNumber(telemetry.promptTokens) ||
    !isNumber(telemetry.completionTokens) ||
    !isNumber(telemetry.totalTokens) ||
    !isNumber(telemetry.estimatedCostUsd) ||
    !isNumber(telemetry.latencyMs) ||
    !isStringArray(telemetry.logs)
  ) {
    return false;
  }
  if (typeof result.artifacts !== 'object' || result.artifacts === null) {
    return false;
  }
  const artifacts = result.artifacts as Record<string, unknown>;
  return (
    typeof artifacts.resultPath === 'string' &&
    typeof artifacts.summaryPath === 'string' &&
    (artifacts.rawOutputPath === undefined || typeof artifacts.rawOutputPath === 'string')
  );
}

export function loadNormalizedResult(inputPath: string): NormalizedRunResult {
  const absolute = path.resolve(inputPath);
  const stats = fs.statSync(absolute);
  const resultPath = stats.isDirectory() ? path.resolve(absolute, 'result.json') : absolute;
  const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as unknown;
  if (!validateNormalizedResult(parsed)) {
    throw new Error(`Invalid normalized result at ${resultPath}`);
  }
  return parsed;
}
