import fs from 'node:fs';
import path from 'node:path';
import type { NormalizedRunResult } from '../core/types.ts';

export function validateNormalizedResult(value: unknown): value is NormalizedRunResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const result = value as Record<string, unknown>;
  if (result.schemaVersion !== '1.0') {
    return false;
  }
  if (typeof result.runId !== 'string' || typeof result.pack !== 'string' || typeof result.variant !== 'string') {
    return false;
  }
  if (typeof result.metrics !== 'object' || result.metrics === null) {
    return false;
  }
  if (typeof result.telemetry !== 'object' || result.telemetry === null) {
    return false;
  }
  return typeof result.artifacts === 'object' && result.artifacts !== null;
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
