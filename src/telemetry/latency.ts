export function summarizeLatencyMs(latencyMs: number): number {
  return Math.max(0, Math.round(latencyMs));
}
