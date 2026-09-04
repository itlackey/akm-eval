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

export interface IdentityPermutation {
  documents: MemoryDocument[];
  /** Maps the synthetic opaque id returned by AKM back to the source id. */
  originalIdByPermutedId: ReadonlyMap<string, string>;
}

/**
 * Reverse the sorted source identities onto monotonic opaque ids. This changes
 * generated filenames/slugs while preserving text and all caller metadata.
 */
export function permuteOpaqueDocumentIdentities(
  documents: readonly MemoryDocument[],
): IdentityPermutation {
  const sortedIds = [...new Set(documents.map((document) => document.id))].sort();
  const width = Math.max(3, String(Math.max(0, sortedIds.length - 1)).length);
  const originalIdByPermutedId = new Map<string, string>();
  const permutedIdByOriginalId = new Map<string, string>();

  for (const [index, originalId] of [...sortedIds].reverse().entries()) {
    // Deliberately non-word-like: the identity must not add a natural-language
    // search term to AKM's generated heading/frontmatter.
    const permutedId = `z9xq${String(index).padStart(width, "0")}`;
    originalIdByPermutedId.set(permutedId, originalId);
    permutedIdByOriginalId.set(originalId, permutedId);
  }

  return {
    documents: documents.map((document) => ({
      ...document,
      id: permutedIdByOriginalId.get(document.id) ?? document.id,
    })),
    originalIdByPermutedId,
  };
}

export function remapPermutedHits(
  hits: readonly MemorySearchResult[],
  originalIdByPermutedId: ReadonlyMap<string, string>,
): MemorySearchResult[] {
  return hits.map((hit) => ({
    ...hit,
    id: originalIdByPermutedId.get(hit.id) ?? hit.id,
  }));
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
  rankingOrMetricDependent: boolean;
  /** First three changes: enough release evidence without dumping corpus text. */
  samples: readonly IdentityPermutationChangedQuery[];
}

/** Compare baseline and identity-permuted runs after remapping back to source ids. */
export function compareIdentityPermutationObservations(
  baseline: readonly IdentityPermutationObservation[],
  permuted: readonly IdentityPermutationObservation[],
): IdentityPermutationDiagnostic {
  const permutedByQuery = new Map(
    permuted.map((observation) => [observation.queryId, observation]),
  );
  let rankChangedQueries = 0;
  let metricChangedQueries = 0;
  const samples: IdentityPermutationChangedQuery[] = [];

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
    rankingOrMetricDependent: rankChangedQueries > 0 || metricChangedQueries > 0,
    samples,
  };
}
