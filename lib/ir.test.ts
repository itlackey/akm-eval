import { describe, expect, test } from "bun:test";
import { mean, retrievalMetrics, summarizeRetrieval } from "./ir.ts";

describe("retrievalMetrics with a list of relevant ids", () => {
  test("scores the first k results against them", () => {
    expect(retrievalMetrics(["a"], ["x", "a", "y"], 5)).toEqual({ returned: 3, hit: true, recall: 1, precision: 0.2, mrr: 0.5, ndcg: 0.6309 });
    expect(retrievalMetrics(["a", "b"], ["a", "x", "y", "z", "b"], 5)).toMatchObject({ returned: 5, hit: true, recall: 1, precision: 0.4, mrr: 1 });
    expect(retrievalMetrics(["a", "b"], ["a", "x", "y", "z", "c", "b"], 5)).toMatchObject({ returned: 5, recall: 0.5, precision: 0.2 });
    expect(retrievalMetrics(["a"], [], 5)).toEqual({ returned: 0, hit: false, recall: 0, precision: 0, mrr: 0, ndcg: 0 });
    expect(retrievalMetrics([], ["a"], 5)).toEqual({ returned: 1, hit: false, recall: 0, precision: 0, mrr: 0, ndcg: 0 });
  });

  test("fewer than k results do not raise the scores: the places that went unfilled count against them", () => {
    expect(retrievalMetrics(["a", "b"], ["a"], 5)).toMatchObject({ returned: 1, recall: 0.5, precision: 0.2 });
    expect(retrievalMetrics(["a", "b"], ["a"], 5).ndcg).toBeCloseTo(1 / (1 + 1 / Math.log2(3)), 4);
  });
});

describe("retrievalMetrics with grades", () => {
  const grades = { a: 3, b: 2, c: 1, d: 0 };

  test("counts an id as relevant from the minimum grade", () => {
    const results = ["c", "a", "x", "b"];
    expect(retrievalMetrics(grades, results, 10, 2)).toMatchObject({ returned: 4, hit: true, recall: 1, precision: 0.2, mrr: 0.5 });
    expect(retrievalMetrics(grades, results, 10, 3)).toMatchObject({ recall: 1, precision: 0.1, mrr: 0.5 });
    expect(retrievalMetrics(grades, ["c", "d"], 10, 2)).toMatchObject({ hit: false, recall: 0, precision: 0, mrr: 0 });
    expect(retrievalMetrics(grades, ["c", "a", "x", "b"], 2, 2)).toMatchObject({ returned: 2, recall: 0.5, precision: 0.5 });
  });

  test("gains 2^grade - 1 at each rank and compares with the best order of everything graded", () => {
    const dcg = 1 / Math.log2(2) + 7 / Math.log2(3) + 3 / Math.log2(5); // c, a, (x), b
    const ideal = 7 / Math.log2(2) + 3 / Math.log2(3) + 1 / Math.log2(4); // a, b, c, (d)
    expect(retrievalMetrics(grades, ["c", "a", "x", "b"], 10, 2).ndcg).toBeCloseTo(dcg / ideal, 4);
    expect(retrievalMetrics(grades, ["a", "b", "c", "d"], 10, 2).ndcg).toBe(1);
    expect(retrievalMetrics(grades, ["d", "x"], 10, 2).ndcg).toBe(0);
  });

  test("cuts the ideal order at k too", () => {
    expect(retrievalMetrics(grades, ["a"], 1, 2).ndcg).toBe(1);
    expect(retrievalMetrics(grades, ["b"], 1, 2).ndcg).toBeCloseTo(3 / 7, 4);
  });

  test("has no ndcg when nothing is graded above zero", () => {
    expect(retrievalMetrics({ d: 0 }, ["d"], 10, 2).ndcg).toBe(0);
    expect(retrievalMetrics({}, ["a"], 10, 2)).toEqual({ returned: 1, hit: false, recall: 0, precision: 0, mrr: 0, ndcg: 0 });
  });

  test("does not mistake a result named like an object member for a graded id", () => {
    expect(retrievalMetrics({ a: 3 }, ["constructor", "toString", "a"], 10, 2)).toMatchObject({ hit: true, mrr: 0.3333 });
  });
});

describe("summarizeRetrieval", () => {
  test("averages over queries", () => {
    const s = summarizeRetrieval([retrievalMetrics(["a"], ["a"], 5), retrievalMetrics(["a"], [], 5)], 5);
    expect(s).toMatchObject({ k: 5, n: 2, zero_hit_rate: 0.5, hit_rate: 0.5, recall: 0.5 });
    expect(summarizeRetrieval([], 5).hit_rate).toBeNull();
  });

  test("mean is null for nothing, and rounds to four places", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 0, 0])).toBe(0.3333);
  });
});
