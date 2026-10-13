import { expect, test } from "bun:test";
import { join } from "node:path";
import { comparePair, loadRun } from "./lib.ts";
const sample = () => loadRun(join(import.meta.dir, "fixtures/reflect/before"));
for (const key of ["eval", "corpus", "collection", "mode", "harness_version", "version", "seed", "input", "label", "selected", "scorer"]) {
  test(`refuses changed ${key} without silently intersecting inputs`, () => {
    const a = sample(), b = structuredClone(a), m = b.summary.manifest, id = m.completion.selected[0];
    if (key === "version") m.collector.version = "99";
    else if (key === "seed") m.settings.seed = "another seed";
    else if (key === "input") m.cases[id].input_sha256 = "f".repeat(64);
    else if (key === "label") m.cases[id].label_sha256 = "f".repeat(64);
    else if (key === "selected") { m.completion.selected.pop(); m.completion.scored.pop(); b.rows.pop(); }
    else if (key === "scorer") m.scorer = { version: "99" };
    else { m[key] = key === "harness_version" ? 99 : "different"; if (key !== "harness_version") b.summary[key] = m[key]; }
    expect(() => comparePair(a, b)).toThrow();
  });
}
test("unchanged saved inputs compare after the checkout changes, without loading a current scorer", () => {
  const a = sample(), b = structuredClone(a);
  a.summary.manifest.collector.version = b.summary.manifest.collector.version = "old-saved-version";
  a.summary.manifest.scorer = b.summary.manifest.scorer = { version: "old-scoring-version" };
  expect(comparePair(a, b).eval_version).toBe("old-saved-version");
});
test("input order and arbitrary case IDs do not change comparison", () => {
  const a = sample(), b = structuredClone(a);
  b.rows.reverse(); b.summary.manifest.completion.selected.reverse();
  expect(comparePair(a, b).rows.find(r => r.key === "quality_percent")!.delta).toBe(0);
});
