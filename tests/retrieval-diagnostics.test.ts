import { describe, expect, test } from "bun:test";
import {
  compareIdentityPermutationObservations,
  hasScoreSaturatedTopK,
  permuteOpaqueDocumentIdentities,
  remapPermutedHits,
} from "../src/probes/retrieval-diagnostics.ts";

describe("retrieval diagnostics", () => {
  test("score saturation counts only a full top-K with finite equal public scores", () => {
    expect(hasScoreSaturatedTopK([], 5)).toBe(false);
    expect(hasScoreSaturatedTopK([{ score: 0.65 }], 5)).toBe(false);
    expect(
      hasScoreSaturatedTopK(
        Array.from({ length: 4 }, () => ({ score: 0.65 })),
        5,
      ),
    ).toBe(false);
    expect(
      hasScoreSaturatedTopK(
        Array.from({ length: 5 }, () => ({ score: 0.65 })),
        5,
      ),
    ).toBe(true);
    expect(
      hasScoreSaturatedTopK(
        [{ score: 0.65 }, { score: 0.65 }, { score: 0.65 }, { score: 0.65 }, { score: 0.64 }],
        5,
      ),
    ).toBe(false);
    expect(
      hasScoreSaturatedTopK(
        [{ score: 0.65 }, { score: null }, { score: 0.65 }, { score: 0.65 }, { score: 0.65 }],
        5,
      ),
    ).toBe(false);
    expect(
      hasScoreSaturatedTopK(
        [
          { score: Number.NaN },
          { score: Number.NaN },
          { score: Number.NaN },
          { score: Number.NaN },
          { score: Number.NaN },
        ],
        5,
      ),
    ).toBe(false);
  });

  test("identity permutation changes only opaque ids and maps returned ids back", () => {
    const permutation = permuteOpaqueDocumentIdentities([
      { id: "D1:1", text: "same body", metadata: { source: "locomo" } },
      { id: "D1:2", text: "same body", metadata: { source: "locomo" } },
    ]);
    expect(permutation.documents.map((document) => document.text)).toEqual([
      "same body",
      "same body",
    ]);
    expect(permutation.documents.map((document) => document.metadata)).toEqual([
      { source: "locomo" },
      { source: "locomo" },
    ]);
    expect(permutation.documents.map((document) => document.id)).not.toEqual(["D1:1", "D1:2"]);
    const firstPermutedId = permutation.documents[0]?.id;
    expect(firstPermutedId).toBeDefined();
    if (!firstPermutedId) throw new Error("Expected a permuted identity");
    expect(
      remapPermutedHits(
        [{ id: firstPermutedId, text: "hit", score: 0.65, metadata: {} }],
        permutation.originalIdByPermutedId,
      )[0]?.id,
    ).toBe("D1:1");
  });

  test("identity permutation reports rank or metric dependence", () => {
    const stable = compareIdentityPermutationObservations(
      [
        {
          queryId: "q",
          hitIds: ["a", "b"],
          publicScores: [1, 0.5],
          metric: [1, 0.5],
          hasDuplicateContent: false,
        },
      ],
      [
        {
          queryId: "q",
          hitIds: ["a", "b"],
          publicScores: [1, 0.5],
          metric: [1, 0.5],
          hasDuplicateContent: false,
        },
      ],
    );
    expect(stable.rankingOrMetricDependent).toBe(false);

    const dependent = compareIdentityPermutationObservations(
      [
        {
          queryId: "q",
          hitIds: ["a", "b"],
          publicScores: [0.65, 0.65],
          metric: [1, 0.5],
          hasDuplicateContent: false,
        },
      ],
      [
        {
          queryId: "q",
          hitIds: ["b", "a"],
          publicScores: [0.65, 0.65],
          metric: [0, 0],
          hasDuplicateContent: false,
        },
      ],
    );
    expect(dependent).toMatchObject({
      rankChangedQueries: 1,
      metricChangedQueries: 1,
      rankingOrMetricDependent: true,
    });
    expect(dependent.samples[0]).toMatchObject({
      kind: "rank-order-only",
      publicScoreSaturated: true,
    });
  });
});
