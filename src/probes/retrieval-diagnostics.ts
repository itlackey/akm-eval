import type { MemoryDocument, MemorySearchResult } from "../memory/types.ts";

/**
 * Public-score saturation is disclosure, not a quality verdict. A retriever can
 * use an unexposed secondary key to order equal displayed scores correctly.
 */
export function hasScoreSaturatedTopK(
  hits: readonly Pick<MemorySearchResult, "score">[],
  topK: number,
): boolean {
  if (hits.length !== topK || topK < 2) return false;
  const first = hits[0]?.score;
  return (
    typeof first === "number" && Number.isFinite(first) && hits.every((hit) => hit.score === first)
  );
}

/** Equal-shape, non-word-like generated names; only storage path/name changes. */
export function opaqueStorageNameProjection(
  direction: "forward" | "reverse",
  documentCount: number,
): (document: MemoryDocument, index: number) => string {
  const width = Math.max(3, String(Math.max(0, documentCount - 1)).length);
  return (_document, index) => {
    const projected = direction === "forward" ? index : documentCount - index - 1;
    return `z9xq${String(projected).padStart(width, "0")}`;
  };
}

export interface IdentityPermutationObservation {
  queryId: string;
  hitIds: readonly string[];
  publicScores: readonly number[];
  metric: readonly number[];
  /** True when at least one returned document has byte-identical corpus text. */
  hasDuplicateContent: boolean;
}

export interface IdentityPermutationChangedQuery {
  queryId: string;
  /** Same members in a different order vs. an identity-sensitive candidate set. */
  kind: "rank-order-only" | "candidate-membership";
  publicScoreSaturated: boolean;
  hasDuplicateContent: boolean;
  baselineHitIds: readonly string[];
  permutedHitIds: readonly string[];
  baselinePublicScores: readonly number[];
  permutedPublicScores: readonly number[];
}

export interface IdentityPermutationDiagnostic {
  mode: "identity-permutation";
  queriesCompared: number;
  rankChangedQueries: number;
  metricChangedQueries: number;
  missingQueryIds: readonly string[];
  extraQueryIds: readonly string[];
  duplicateBaselineQueryIds: readonly string[];
  duplicatePermutedQueryIds: readonly string[];
  rankingOrMetricDependent: boolean;
  /** First three changes: enough release evidence without dumping corpus text. */
  samples: readonly IdentityPermutationChangedQuery[];
}

/** Compare baseline and identity-permuted runs after remapping back to source ids. */
export function compareIdentityPermutationObservations(
  baseline: readonly IdentityPermutationObservation[],
  permuted: readonly IdentityPermutationObservation[],
): IdentityPermutationDiagnostic {
  const duplicates = (observations: readonly IdentityPermutationObservation[]): string[] => {
    const counts = new Map<string, number>();
    for (const observation of observations) {
      counts.set(observation.queryId, (counts.get(observation.queryId) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, count]) => count > 1)
      .map(([queryId]) => queryId)
      .sort();
  };
  const permutedByQuery = new Map(
    permuted.map((observation) => [observation.queryId, observation]),
  );
  let rankChangedQueries = 0;
  let metricChangedQueries = 0;
  const samples: IdentityPermutationChangedQuery[] = [];
  const baselineIds = new Set(baseline.map((observation) => observation.queryId));
  const permutedIds = new Set(permuted.map((observation) => observation.queryId));
  const missingQueryIds = [...baselineIds].filter((queryId) => !permutedIds.has(queryId)).sort();
  const extraQueryIds = [...permutedIds].filter((queryId) => !baselineIds.has(queryId)).sort();
  const duplicateBaselineQueryIds = duplicates(baseline);
  const duplicatePermutedQueryIds = duplicates(permuted);

  for (const original of baseline) {
    const replay = permutedByQuery.get(original.queryId);
    if (!replay) {
      rankChangedQueries += 1;
      metricChangedQueries += 1;
      if (samples.length < 3) {
        samples.push({
          queryId: original.queryId,
          kind: "candidate-membership",
          publicScoreSaturated: false,
          hasDuplicateContent: original.hasDuplicateContent,
          baselineHitIds: original.hitIds,
          permutedHitIds: [],
          baselinePublicScores: original.publicScores,
          permutedPublicScores: [],
        });
      }
      continue;
    }
    const rankChanged = JSON.stringify(original.hitIds) !== JSON.stringify(replay.hitIds);
    if (rankChanged) rankChangedQueries += 1;
    if (JSON.stringify(original.metric) !== JSON.stringify(replay.metric))
      metricChangedQueries += 1;
    if (rankChanged && samples.length < 3) {
      const sameMembers =
        original.hitIds.length === replay.hitIds.length &&
        [...original.hitIds].sort().join("\u0000") === [...replay.hitIds].sort().join("\u0000");
      samples.push({
        queryId: original.queryId,
        kind: sameMembers ? "rank-order-only" : "candidate-membership",
        publicScoreSaturated:
          original.publicScores.length > 1 &&
          original.publicScores.every((score) => score === original.publicScores[0]),
        hasDuplicateContent: original.hasDuplicateContent || replay.hasDuplicateContent,
        baselineHitIds: original.hitIds,
        permutedHitIds: replay.hitIds,
        baselinePublicScores: original.publicScores,
        permutedPublicScores: replay.publicScores,
      });
    }
  }

  return {
    mode: "identity-permutation",
    queriesCompared: baseline.length,
    rankChangedQueries,
    metricChangedQueries,
    missingQueryIds,
    extraQueryIds,
    duplicateBaselineQueryIds,
    duplicatePermutedQueryIds,
    rankingOrMetricDependent:
      rankChangedQueries > 0 ||
      metricChangedQueries > 0 ||
      missingQueryIds.length > 0 ||
      extraQueryIds.length > 0 ||
      duplicateBaselineQueryIds.length > 0 ||
      duplicatePermutedQueryIds.length > 0,
    samples,
  };
}
