import { describe, expect, test } from "bun:test";
import {
  compareIdentityPermutationObservations,
  hasScoreSaturatedTopK,
  opaqueStorageNameProjection,
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

  test("storage projections are equal-shape opaque names in opposite path order", () => {
    const document = { id: "caller-id", text: "same body", metadata: { source: "locomo" } };
    expect(opaqueStorageNameProjection("forward", 3)(document, 0)).toBe("z9xq000");
    expect(opaqueStorageNameProjection("reverse", 3)(document, 0)).toBe("z9xq002");
    expect(document).toEqual({
      id: "caller-id",
      text: "same body",
      metadata: { source: "locomo" },
    });
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

  test("identity permutation rejects duplicate, missing, and extra query ids", () => {
    const invalid = compareIdentityPermutationObservations(
      [
        { queryId: "a", hitIds: [], publicScores: [], metric: [], hasDuplicateContent: false },
        { queryId: "a", hitIds: [], publicScores: [], metric: [], hasDuplicateContent: false },
        { queryId: "b", hitIds: [], publicScores: [], metric: [], hasDuplicateContent: false },
      ],
      [
        { queryId: "a", hitIds: [], publicScores: [], metric: [], hasDuplicateContent: false },
        { queryId: "c", hitIds: [], publicScores: [], metric: [], hasDuplicateContent: false },
      ],
    );
    expect(invalid.rankingOrMetricDependent).toBe(true);
    expect(invalid).toMatchObject({
      missingQueryIds: ["b"],
      extraQueryIds: ["c"],
      duplicateBaselineQueryIds: ["a"],
    });
  });
});
