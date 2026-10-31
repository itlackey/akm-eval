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
