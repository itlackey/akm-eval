import { expect, test } from "bun:test";
import { scores, testInfo } from "./presentation";
import { presentRun } from "./data";

test("consolidation separates retirement coverage from retirement safety with the correct denominator", () => {
  const result = scores({ eval: "consolidate", metrics: {
    recall: { value: 0.8, retired_safe: 24, of: 30 },
    unsafe: { n: 0, of: 60 }, precision: { value: 1, safe: 24, retired: 24 },
  } });
  expect(result.map(score => [score.label, score.value, score.numerator, score.denominator])).toEqual([
    ["Safe retirements found", 0.8, 24, 30], ["Unsafe retirements", 0, null, null],
    ["Retirements that were safe", 1, 24, 24],
  ]);
  expect(result[1]!.lower_is_better).toBe(true);
});

test("retrieval exposes both ranking methods and judgment coverage instead of hiding semantic results", () => {
  const result = scores({ eval: "retrieval", metrics: {
    search: { ndcg_10: 0.8768, recall_10: 0.9542, judged_10: 0.2427 },
    semantic_search: { ndcg_10: 0.9214, recall_10: 0.9706, judged_10: 0.2118 },
  } });
  expect(result.map(score => score.value)).toEqual([0.8768, 0.9542, 0.2427, 0.9214, 0.9706, 0.2118]);
  expect(result[0]!.unit).toBe("decimal");
  expect(result[5]!.explanation).toContain("Low coverage");
});

test("paired answer scores keep unequal denominators and do not invent a zero for missing metrics", () => {
  const result = scores({ eval: "longmemeval", metrics: { accuracy: {
    without_akm: { n: 5, correct: 3, rate: 0.6 }, with_akm: { n: 4, correct: 3, rate: 0.75 },
  } } });
  expect(result.map(score => [score.value, score.denominator])).toEqual([[0.6, 5], [0.75, 4]]);
  expect(scores({ eval: "reflect", metrics: {} }).every(score => score.value === null)).toBe(true);
  expect(scores({ eval: "new-test", metrics: { future: 1 } })).toEqual([]);
});

test("friendly test names retain a link to each test's scoring rules", () => {
  expect(testInfo("reflect").name).toBe("Asset repair");
  expect(testInfo("agent-ab").documentation).toContain("/evals/agent-ab");
  expect(testInfo("skillret").documentation).toContain("/benchmarks/skillret");
});

test("additional ranking cutoffs, judgment-adjusted ranking and completeness are retained as independent columns", () => {
  const result = scores({ eval: "skillret", metrics: { search: { "NDCG@10": .5, "NDCG@5": .4, "Completeness@15": .7, "MAP@15": .6 } } });
  expect(result.find(score => score.label === "Keyword nDCG@5")?.value).toBe(.4);
  expect(result.find(score => score.label === "Keyword completeness@15")?.value).toBe(.7);
  expect(result.find(score => score.label === "Keyword MAP@15")?.value).toBe(.6);
  const judged = scores({ eval: "retrieval", metrics: { search: { ndcg_10: .8, ndcg_10_condensed: .9 } } });
  expect(judged.find(score => score.label === "Keyword judged nDCG@10")?.value).toBe(.9);
});

test("individual runs retain their different engine settings", () => {
  const summary = { eval: "reflect", corpus: "public", status: "complete", model: "model",
    manifest: { engines: { model: { temperature: 0 } } } };
  const base = { summary, samples: [], path: "v/reflect/r1", sourceRevision: "revision" };
  const first = presentRun(base)!;
  const changed = presentRun({ ...base, summary: { ...summary, manifest: { engines: { model: { temperature: 1 } } } } })!;
  expect(first.comparison.temperature).toBe(0);
  expect(changed.comparison.temperature).toBe(1);
});

test('judge gate exposes useful acceptance separately from approval precision', () => {
  const result = scores({ eval: 'judge-gate', metrics: { precision: { value: 1, passed_good: 15, passed: 15 }, good: { rate: .375, passed: 15, n: 40 }, bad: { rate: 0, passed: 0, n: 95 } } });
  expect(result.find(score => score.label === 'Approved lessons that were good')).toMatchObject({ value: 1, numerator: 15, denominator: 15 });
  expect(result.find(score => score.label === 'Good proposals approved')).toMatchObject({ value: .375, numerator: 15, denominator: 40 });
});
