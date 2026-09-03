import { describe, expect, test } from "bun:test";

import { ConfigValidationError } from "../src/core/errors.ts";
import { sampleItems } from "../src/core/sampling.ts";

const items = Array.from({ length: 100 }, (_, i) => i);

describe("sampleItems", () => {
  test("refuses to subset a measurement run without a seed", () => {
    // The whole point: an unseeded subset silently becomes first-N, which is a
    // systematic slice of file order and cannot be compared to a published
    // figure. Failing is the correct outcome, not a fallback.
    expect(() => sampleItems(items, 10, { label: "test" })).toThrow(ConfigValidationError);
  });

  test("smoke runs may take the first N, and say so in their provenance", () => {
    const result = sampleItems(items, 5, { smoke: true, label: "test" });
    expect(result.items).toEqual([0, 1, 2, 3, 4]);
    expect(result.provenance).toEqual({ order: "first-n", seed: null, n: 5, total: 100 });
  });

  test("the same seed reproduces the same sample", () => {
    const a = sampleItems(items, 10, { seed: 1337, label: "test" });
    const b = sampleItems(items, 10, { seed: 1337, label: "test" });
    expect(a.items).toEqual(b.items);
    expect(a.provenance).toEqual({ order: "seeded-random", seed: 1337, n: 10, total: 100 });
  });

  test("a different seed draws a different sample", () => {
    const a = sampleItems(items, 10, { seed: 1337, label: "test" });
    const b = sampleItems(items, 10, { seed: 7, label: "test" });
    expect(a.items).not.toEqual(b.items);
  });

  test("the sample is not the first N", () => {
    const a = sampleItems(items, 10, { seed: 1337, label: "test" });
    expect(a.items).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("selected items keep their source order, so output stays diffable", () => {
    const a = sampleItems(items, 20, { seed: 99, label: "test" });
    expect(a.items).toEqual([...a.items].sort((x, y) => x - y));
  });

  test("no duplicates: a partial shuffle must not select an index twice", () => {
    const a = sampleItems(items, 40, { seed: 5, label: "test" });
    expect(new Set(a.items).size).toBe(40);
  });

  test("draws roughly uniformly across the source range", () => {
    // A biased sampler (e.g. an off-by-one that never reaches the tail) would
    // pass every test above. Check the halves are both represented across many
    // seeds rather than trusting the shuffle by inspection.
    let firstHalf = 0;
    let secondHalf = 0;
    for (let seed = 0; seed < 50; seed++) {
      for (const value of sampleItems(items, 10, { seed, label: "test" }).items) {
        if (value < 50) firstHalf++;
        else secondHalf++;
      }
    }
    expect(firstHalf).toBeGreaterThan(150);
    expect(secondHalf).toBeGreaterThan(150);
  });

  test("n at or above the population returns everything, marked full", () => {
    for (const n of [100, 250, undefined, 0]) {
      const result = sampleItems(items, n, { label: "test" });
      expect(result.items).toHaveLength(100);
      expect(result.provenance.order).toBe("full");
      expect(result.provenance.total).toBe(100);
    }
  });
});

describe("LongMemEval category normalization", () => {
  test("every dataset question_type maps to a distinct, correct category", async () => {
    // The old normalizeCategory tested `single` before `preference` and ended
    // in `return "single-session"`, so `single-session-preference` was
    // mislabelled and all 78 `knowledge-update` questions were absorbed
    // silently. Both are wrong denominators on every per-category figure.
    const { loadDataset } = await import("../src/packs/longmemeval/dataset.ts");
    const questions = await loadDataset({});
    const counts: Record<string, number> = {};
    for (const q of questions) counts[q.category] = (counts[q.category] ?? 0) + 1;

    expect(counts["knowledge-update"]).toBe(78);
    expect(counts.preference).toBe(30);
    expect(counts["single-session"]).toBe(126);
    expect(counts["multi-session"]).toBe(133);
    expect(counts.temporal).toBe(133);
    expect(questions).toHaveLength(500);
  });

  test("the seeded sample spans categories; first-N does not", async () => {
    // This is the concrete bug the seed fixes: the committed n=25 rounds drew
    // 25 questions that were ALL one category.
    const { loadDataset } = await import("../src/packs/longmemeval/dataset.ts");
    const full = await loadDataset({});
    const sampled = await loadDataset({ maxQuestions: 25, sampleSeed: 1337 });

    const spread = (qs: typeof full) => new Set(qs.map((q) => q.category)).size;
    expect(spread(full.slice(0, 25))).toBe(1);
    expect(spread(sampled)).toBeGreaterThanOrEqual(4);
  });
});
