import type { AnswerMetrics } from './types.ts';

function normalize(value: string): string {
  // Intentionally normalize aggressively so smoke-test scoring is deterministic across punctuation differences
  // such as "don't" -> "don t" and "well-known" -> "well known".
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

export function scoreAnswer(expected?: string, actual?: string): AnswerMetrics {
  const safeExpected = expected ?? '';
  const safeActual = actual ?? '';
  const normalizedExpected = normalize(safeExpected);
  const normalizedActual = normalize(safeActual);
  const exactMatch = normalizedExpected.length > 0 && normalizedExpected === normalizedActual ? 1 : 0;

  const expectedTokens = tokens(safeExpected);
  const actualTokens = tokens(safeActual);
  const expectedSet = new Map<string, number>();
  const actualSet = new Map<string, number>();

  for (const token of expectedTokens) {
    expectedSet.set(token, (expectedSet.get(token) ?? 0) + 1);
  }

  for (const token of actualTokens) {
    actualSet.set(token, (actualSet.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const [token, count] of expectedSet.entries()) {
    overlap += Math.min(count, actualSet.get(token) ?? 0);
  }

  const precision = actualTokens.length === 0 ? 0 : overlap / actualTokens.length;
  const recall = expectedTokens.length === 0 ? 0 : overlap / expectedTokens.length;
  const tokenF1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const containsExpected = normalizedExpected.length > 0 && normalizedActual.includes(normalizedExpected) ? 1 : 0;

  return {
    exactMatch,
    tokenF1: Number(tokenF1.toFixed(6)),
    containsExpected,
    judgedPass: 0,
  };
}
