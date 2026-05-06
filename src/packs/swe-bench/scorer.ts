export function scoreSweBenchAdapter(rawScore: number): number {
  if (!Number.isFinite(rawScore)) {
    return 0;
  }

  return Number(Math.max(0, Math.min(1, rawScore)).toFixed(6));
}
