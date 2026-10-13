import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { measuredEvals, REPO_ROOT } from "../../../lib/manifest.ts";
import { SUPPORTED, comparePair } from "./lib.ts";
import { manifested } from "./fixtures/make.ts";

test("all 13 evals and benchmarks retain runners and comparison support", () => {
  expect(SUPPORTED.length).toBe(13);
  expect([...SUPPORTED].sort()).toEqual(measuredEvals());
  for (const name of SUPPORTED) expect(["evals", "benchmarks"].some(base => existsSync(join(REPO_ROOT, base, name, "run")))).toBe(true);
});
for (const name of ["agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret"]) {
  test(`${name}: preserves every recorded metric and native confidence interval`, () => {
    const summary = manifested({ eval: name, corpus: "public", status: "complete", model: "example",
      metrics: { accuracy: { value: .5, ci95: [.25, .75] }, latency: 2, new_native_metric: 7 } }, ["task"]);
    const run = { dir: name, summary, rows: [{ id: "task" }] };
    const report = comparePair(run, structuredClone(run));
    expect(report.rows.find(r => r.key === "metrics.accuracy.ci95.0")?.a).toBe(.25);
    expect(report.rows.find(r => r.key === "metrics.new_native_metric")?.a).toBe(7);
  });
}
