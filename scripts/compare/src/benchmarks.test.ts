import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { measuredEvals, REPO_ROOT } from "../../../lib/manifest.ts";
import { SUPPORTED, comparePair } from "./lib.ts";
import { manifested } from "./fixtures/make.ts";

test("all 14 evals and benchmarks retain runners and comparison support", () => {
  expect(SUPPORTED.length).toBe(14);
  expect([...SUPPORTED].sort()).toEqual(measuredEvals());
  for (const name of SUPPORTED) expect(["evals", "benchmarks"].some(base => existsSync(join(REPO_ROOT, base, name, "run")))).toBe(true);
});
for (const name of ["agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret", "memory-utility"]) {
  test(`${name}: preserves every recorded metric and native confidence interval`, () => {
    const summary = manifested({ eval: name, corpus: "public", status: "complete", model: "example",
      metrics: { accuracy: { value: .5, ci95: [.25, .75] }, latency: 2, new_native_metric: 7 } }, ["task"]);
    const run = { dir: name, summary, rows: [{ id: "task" }] };
    const report = comparePair(run, structuredClone(run));
    expect(report.rows.find(r => r.key === "metrics.accuracy.ci95.0")?.a).toBe(.25);
    expect(report.rows.find(r => r.key === "metrics.new_native_metric")?.a).toBe(7);
  });
}

test("memory usefulness headlines the inferred arm, retaining controls and separate deltas", () => {
  const summary = manifested({ eval: "memory-utility", corpus: "public", status: "complete", model: "example",
    metrics: { arms: Object.fromEntries([["none", 0], ["source", .5], ["inferred", 1]].map(([arm, rate]) =>
      [arm, { failure_inclusive_accuracy: { rate, correct: Number(rate) * 2, n: 2 } }])),
      memory_inference: { failure_inclusive: { value: .5, ci95: [-1, 1] } },
      persistent_memory: { failure_inclusive: { value: .5 } } } }, ["one", "two"]);
  const run = { dir: "memory-utility", summary, rows: [{ id: "one" }, { id: "two" }] };
  const report = comparePair(run, structuredClone(run));
  expect(report.rows.find(r => r.key === "quality_metric")?.a).toBe("Native inference");
  expect(report.rows.find(r => r.key === "quality_percent")?.a).toBe(100);
  for (const path of ["memory_inference", "persistent_memory"])
    expect(report.rows.find(r => r.key === `metrics.${path}.failure_inclusive.value`)?.a).toBe(.5);
  for (const arm of ["none", "source", "inferred"])
    expect(report.rows.some(r => r.key === `metrics.arms.${arm}.failure_inclusive_accuracy.rate`)).toBe(true);
  expect(report.rows.find(r => r.key === "memory_inferred_accuracy")).toMatchObject({ label: "Inferred memory (%)", group: "Memory · quality", a: 100 });
});

test("memory usefulness on LongMemEval cases compares every budget, apart and by their labels", () => {
  const budget = (source: number, inferred: number, gain: number, p: number) => ({
    arms: { none: { failure_inclusive_accuracy: { rate: .1 }, mean_context_estimated_tokens: 0 }, source: { failure_inclusive_accuracy: { rate: source }, mean_context_estimated_tokens: 250 }, inferred: { failure_inclusive_accuracy: { rate: inferred }, mean_context_estimated_tokens: 240 } },
    persistent_memory: { failure_inclusive: { value: source - .1, p_value: .01 } }, memory_inference: { failure_inclusive: { value: gain, ci95: [gain - .2, gain + .2], p_value: p } } });
  const make = (inferredPrimary: number) => manifested({ eval: "memory-utility", corpus: "public", status: "complete", model: "example", case_source: "longmemeval", split: "dev",
    metrics: { primary_budget: 4096, cross_budget_inference: { failure_inclusive: { value: inferredPrimary - .4, ci95: [-.2, .4], p_value: .25, helps: 3, harms: 1 } },
      primary_comparisons: { comparisons: { matched_budget: { p_value: .5, p_holm: .5 }, cross_budget: { p_value: .25, p_holm: .5 } } },
      by_budget: { "8192": budget(.4, .3, -.1, .3), "4096": budget(.6, inferredPrimary, inferredPrimary - .6, .5) } } }, ["one", "two"]);
  const a = { dir: "a", summary: make(.5), rows: [{ id: "one" }, { id: "two" }] }, b = { dir: "b", summary: make(.7), rows: [{ id: "one" }, { id: "two" }] };
  const report = comparePair(a, b);
  expect(report.rows.find(r => r.key === "memory_b4096_inferred_accuracy")).toMatchObject({ label: "Inferred memory @ 4096 (%)", group: "Memory · budgets", a: 50, b: 70 });
  expect(report.rows.find(r => r.key === "memory_b8192_memory_inference_p_value")).toMatchObject({ label: "Inferred − notes @ 8192 p-value", a: .3, b: .3, delta: 0 });
  const cross = report.rows.find(r => r.key === "memory_cross_budget_inference_failure_inclusive_gain")!;
  expect(cross).toMatchObject({ label: "Inferred @ 4096 − notes @ 8192 · all selected (pp)", group: "Memory · budgets" });
  expect([cross.a, cross.b]).toEqual([expect.closeTo(10), expect.closeTo(30)]);
  expect(report.rows.find(r => r.key === "memory_cross_budget_inference_failure_inclusive_p_value")).toMatchObject({ a: .25, b: .25, delta: 0 });
  expect(report.rows.find(r => r.key === "memory_holm_cross_budget_p")).toMatchObject({ label: "Inferred @ 4096 − notes @ 8192 · Holm-adjusted p-value", a: .5, b: .5 });
  expect(report.rows.find(r => r.key === "memory_b4096_source_tokens")).toMatchObject({ a: 250 });
  expect(report.rows.find(r => r.key === "metrics.by_budget.4096.memory_inference.failure_inclusive.ci95.1")).toBeDefined(); // the raw stored value is kept too
  expect(report.rows.some(r => r.key === "memory_b2048_inferred_accuracy")).toBe(false); // a budget the runs did not record is not a row
});
