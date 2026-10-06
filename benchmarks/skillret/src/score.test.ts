import { describe, expect, test } from "bun:test";
import { KS, METRICS, scoreQuery, summarize } from "./score.ts";

const filler = (n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `x${from + i}`);

// Hand-made rankings, and what SkillRet's own scoring gives them: pytrec_eval 0.5.10 (pytrec-eval-terrier, the version
// in its pyproject.toml) with the measures its trec_eval asks for, ndcg_cut, map_cut and recall at 5, 10 and 15, and
// Completeness as recall == 1.0. Each row lists NDCG, Recall, Completeness and MAP, each at 5, 10 and 15.
//   RelevanceEvaluator(qrels, {"ndcg_cut.5,10,15", "map_cut.5,10,15", "recall.5,10,15"}).evaluate(run)
// where the run scores a ranking's skills 1000, 999, 998 and so on.
const CASES: [name: string, relevant: string[], ranked: string[], expected: number[]][] = [
  ["one relevant, first", ["a"], ["a", "x", "y"], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  ["one relevant, sixth", ["a"], [...filler(5), "a", "x7"], [0, 0.3562, 0.3562, 0, 1, 1, 0, 1, 1, 0, 0.1667, 0.1667]],
  ["one relevant, fifteenth", ["a"], [...filler(14), "a"], [0, 0, 0.25, 0, 0, 1, 0, 0, 1, 0, 0, 0.0667]],
  ["one relevant, sixteenth", ["a"], [...filler(15), "a"], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ["two relevant, first and twelfth", ["a", "b"], ["a", ...filler(10), "b"], [0.6131, 0.6131, 0.7788, 0.5, 0.5, 1, 0, 0, 1, 0.5, 0.5, 0.5833]],
  ["three relevant, all in the first five", ["a", "b", "c"], ["x", "b", "y", "a", "c", "z"], [0.6797, 0.6797, 0.6797, 1, 1, 1, 1, 1, 1, 0.5333, 0.5333, 0.5333]],
  ["three relevant, one found", ["a", "b", "c"], ["x", "y", "c", "z"], [0.2346, 0.2346, 0.2346, 0.3333, 0.3333, 0.3333, 0, 0, 0, 0.1111, 0.1111, 0.1111]],
  ["two relevant, both in a short list", ["a", "b"], ["b", "a"], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  ["nothing found", ["a", "b"], ["x", "y", "z"], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ["no results", ["a"], [], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ["two relevant, split by the cut", ["a", "b"], ["x1", "x2", "x3", "a", "x5", "x6", "b"], [0.2641, 0.4685, 0.4685, 0.5, 1, 1, 0, 1, 1, 0.125, 0.2679, 0.2679]],
];
// The means over all eleven, as pytrec_eval gives them: an empty ranking is a query that scores 0, and it counts.
const MEANS = [0.3447, 0.3957, 0.4334, 0.3939, 0.5303, 0.6667, 0.2727, 0.4545, 0.6364, 0.2972, 0.3254, 0.339];

/** A query's scores as the twelve numbers above: NDCG, Recall, Completeness and MAP at 5, 10 and 15. */
const asList = (scores: Record<string, number>): number[] => METRICS.flatMap((m) => KS.map((k) => scores[`${m}@${k}`]));

describe("scoreQuery matches SkillRet's own scoring", () => {
  for (const [name, relevant, ranked, expected] of CASES) {
    test(name, () => {
      const got = asList(scoreQuery(relevant, ranked));
      expected.forEach((x, i) => expect(got[i]).toBeCloseTo(x, 4));
    });
  }

  test("a skill returned twice counts once, and a ranking longer than 15 is cut", () => {
    expect(scoreQuery(["a", "b"], ["a", "a", "a", "x"])).toEqual(scoreQuery(["a", "b"], ["a", "x"]));
    expect(scoreQuery(["a"], [...filler(15), "a"])["Recall@15"]).toBe(0);
  });

  test("names every metric after the benchmark's", () => {
    expect(Object.keys(scoreQuery(["a"], ["a"]))).toEqual(METRICS.flatMap((m) => KS.map((k) => `${m}@${k}`)));
  });
});

describe("summarize", () => {
  test("is the mean over every query, one that got nothing included", () => {
    const got = asList(summarize(CASES.map(([, relevant, ranked]) => scoreQuery(relevant, ranked))));
    MEANS.forEach((x, i) => expect(got[i]).toBeCloseTo(x, 4));
  });

  test("is empty for no queries", () => {
    expect(summarize([])).toEqual({});
  });
});
