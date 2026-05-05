export function estimateCostUsd(totalTokens: number, ratePerThousand = 0.002): number {
  return Number(((totalTokens / 1000) * ratePerThousand).toFixed(6));
}
