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

test("a project-intent run's primary score is the bare arm, with both differences to none and their intervals", () => {
  const arm = (pass_rate: number, passed: number) => ({ pass_rate, passed, scored: 4, other_project_rate: 0.5, tokens_per_correct: 900 });
  const result = scores({ eval: "project-intent", metrics: {
    arms: { none: arm(0.25, 1), bare: arm(0.75, 3), explicit: arm(1, 4) },
    comparisons: { "bare-none": { value: 0.5, lo: 0.1, hi: 0.9 }, "explicit-none": { value: 0.75, lo: 0.5, hi: 1 }, "explicit-bare": { value: 0.25 } },
  } });
  expect(result[0]).toMatchObject({ label: "Pass rate · bare", value: 0.75, numerator: 3, denominator: 4 });
  expect(result.find(score => score.label === "Pass-rate gain · bare − none · CI low")?.value).toBe(0.1);
  expect(result.find(score => score.label === "Tokens per correct outcome · explicit")).toMatchObject({ value: 900, unit: "count", lower_is_better: true });
  expect(result.some(score => score.label.includes("explicit − bare"))).toBe(false);
  expect(testInfo("project-intent").documentation).toContain("/evals/project-intent");
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

test('drain-judge reports the harm number next to the good ones accepted', () => {
  const result = scores({ eval: 'drain-judge', metrics: { precision: { value: .8, accepted_good: 8, accepted: 10 }, good_accepted: { rate: .4, count: 8, n: 20 }, bad_accepted: { rate: .1, count: 6, n: 60 }, good_rejected: { rate: .05, count: 1, n: 20 }, bad_by_origin: { real: { rate: 0, count: 0, n: 1 }, corpus: { rate: .25, count: 1, n: 4 }, 'hand-written': { rate: .0909, count: 5, n: 55 } } } });
  expect(result.find(score => score.label === 'Bad hand-written promotions accepted')).toMatchObject({ value: .0909, numerator: 5, denominator: 55, lower_is_better: true });
  expect(result.find(score => score.label === 'Bad corpus promotions accepted')).toMatchObject({ value: .25, numerator: 1, denominator: 4, lower_is_better: true });
  expect(result.find(score => score.label === 'Bad promotions accepted')).toMatchObject({ value: .1, numerator: 6, denominator: 60, lower_is_better: true });
  expect(result.find(score => score.label === 'Good promotions accepted')).toMatchObject({ value: .4, numerator: 8, denominator: 20 });
  expect(result.find(score => score.label === 'Accepted promotions that were good')).toMatchObject({ value: .8, numerator: 8, denominator: 10 });
});

test('lesson judge reports new lessons and updates apart, with the bad ones as a lower-is-better score', () => {
  const metrics = { good: { new: { rate: .5, passed: 10, n: 20 }, update: { rate: .8, passed: 8, n: 10 } }, bad: { new: { rate: .25, passed: 5, n: 20 }, update: { rate: .1, passed: 1, n: 10 } } };
  const result = scores({ eval: 'lesson-judge', metrics });
  expect(result.find(score => score.label === 'Good new lessons passed')).toMatchObject({ value: .5, numerator: 10, denominator: 20, lower_is_better: false });
  expect(result.find(score => score.label === 'Bad new lessons passed')).toMatchObject({ value: .25, numerator: 5, denominator: 20, lower_is_better: true });
  expect(result.find(score => score.label === 'Bad lesson updates passed')).toMatchObject({ value: .1, numerator: 1, denominator: 10, lower_is_better: true });
});

test("pair judge headlines unsafe retirements next to the safe ones it finds", () => {
  const result = scores({ eval: "pair-judge", metrics: { unsafe: { n: 88, count: 2, rate: .0227 }, found: { n: 65, count: 60, rate: .9231 }, precision: { value: .9677, safe: 60, retired: 62 }, relation: { n: 110, count: 90, rate: .8182 }, claims: { labelled: 160, found: 140, found_rate: .875 }, failed: { n: 112, count: 2, rate: .0179 } } });
  expect(result.find(score => score.label === "Unsafe retirements")).toMatchObject({ value: .0227, numerator: 2, denominator: 88, lower_is_better: true });
  expect(result.find(score => score.label === "Safe retirements found")).toMatchObject({ value: .9231, numerator: 60, denominator: 65 });
  expect(result.find(score => score.label === "Claims found")).toMatchObject({ value: .875, numerator: 140, denominator: 160 });
  expect(testInfo("pair-judge").name).toBe("Pair comparison");
});
