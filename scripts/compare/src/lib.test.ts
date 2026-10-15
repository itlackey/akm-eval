import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comparePair, loadRun, renderPair, type Run } from "./lib.ts";

const fixtures = join(import.meta.dir, "fixtures");
const fixture = (suite = "reflect", side = "before") => loadRun(join(fixtures, suite, side));
const folders: string[] = [];
afterEach(() => folders.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
const clone = (run: Run) => structuredClone(run);

describe("two stored runs", () => {
  for (const suite of ["nightly", "reflect", "distill", "consolidate", "consolidate-pool", "promotion", "extract", "judge-gate", "retrieval"]) {
    test(`${suite}: displays the stored metrics, without rescoring or modifying fixtures`, () => {
      const a = fixture(suite), b = fixture(suite, "after");
      const before = JSON.stringify([a, b]);
      const report = comparePair(a, b);
      expect(report.rows.some(r => r.group === "Stored metrics")).toBe(true);
      expect(renderPair(report)).toContain("No statistical winner");
      expect(JSON.stringify([a, b])).toBe(before);
    });
  }
  test("one run on each side is enough, and changes in model and config are displayed", () => {
    const a = fixture(), b = clone(a);
    b.summary.model = "another model";
    b.summary.manifest.engines.model = { model: "another model", endpoint: "https://example.org" };
    b.summary.manifest.settings.strategy = "new strategy";
    b.summary.metrics.defects.rate = .999;
    const report = comparePair(a, b);
    expect(report.changes.map(c => c.field)).toContain("model");
    expect(report.rows.find(r => r.key === "metrics.defects.rate")!.b).toBe(.999);
    expect(report.rows.find(r => r.key === "metrics.defects.rate")!.delta).not.toBeNull();
  });
  test("shows deltas alongside recorded coverage even when scored cases differ", () => {
    const a = fixture(), b = clone(a);
    a.summary.manifest.completion.errored = [a.rows[0]!.id];
    b.summary.manifest.completion.errored = [b.rows[1]!.id];
    for (const r of [a, b]) r.summary.manifest.completion.scored = r.rows.map(row => row.id).filter(id => !r.summary.manifest.completion.errored.includes(id));
    const report = comparePair(a, b);
    expect(report.rows.find(r => r.key === "quality_percent")!.delta).toBe(0);
    expect(report.rows.find(r => r.key === "errors")!.delta).toBe(0);
  });
  test("unequal timing records keep stored values and arithmetic deltas", () => {
    const a = fixture(), b = clone(a);
    delete b.rows[0]!.seconds;
    const row = comparePair(a, b).rows.find(r => r.key === "case_mean_s")!;
    expect(row.a).toBe(1);
    expect(row.b).toBe(1);
    expect(row.delta).toBe(0);
  });
  test("unrecorded telemetry stays missing; recorded zero stays zero", () => {
    const a = fixture(), b = clone(a);
    b.summary.model_calls = { calls: 0, errors: 0, prompt_tokens: null, completion_tokens: null, seconds: 0, output_tokens_per_second: null };
    const report = comparePair(a, b);
    expect(report.rows.find(r => r.key === "model_mean_request_s")).toMatchObject({ a: null, b: 0, delta: null });
    expect(report.rows.some(r => r.key === "model_output_tokens_per_s")).toBe(false);
  });
  test("malformed and duplicate samples fail; legacy files and stale markers stay readable", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-")); folders.push(dir);
    const source = join(fixtures, "reflect", "before"); cpSync(source, dir, { recursive: true });
    writeFileSync(join(dir, ".running"), ""); expect(loadRun(dir).running).toBe(true); rmSync(join(dir, ".running"));
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8");
    writeFileSync(join(dir, "samples.jsonl"), rows + rows); expect(() => loadRun(dir)).toThrow("duplicate");
    writeFileSync(join(dir, "samples.jsonl"), "{bad}"); expect(() => loadRun(dir)).toThrow("invalid JSON");
    writeFileSync(join(dir, "samples.jsonl"), rows);
    const summary = fixture().summary; delete summary.manifest;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary)); expect(loadRun(dir).rows.length).toBeGreaterThan(0);
  });
  test("CLI writes JSON and Markdown, rejects old orchestration flags and source overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-cli-")); folders.push(dir);
    const cli = (args: string[]) => Bun.spawnSync([process.execPath, join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
    const a = join(fixtures, "reflect/before"), b = join(fixtures, "reflect/after");
    const good = cli([a, b, "--json", join(dir, "report.json"), "--md", join(dir, "report.md")]);
    expect(good.stderr.toString()).toBe(""); expect(good.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "report.json"), "utf8")).rows.length).toBeGreaterThan(0);
    expect(cli([a, b, "--treatment", "model"]).exitCode).toBe(2);
    expect(cli([a, b, "--json", join(a, "summary.json")]).exitCode).toBe(2);
    const copy = join(dir, "source"); cpSync(a, copy, { recursive: true });
    const original = readFileSync(join(copy, "summary.json"), "utf8");
    expect(cli([copy, b, "--json", join(copy, "comparison.json")]).exitCode).toBe(0);
    expect(readFileSync(join(copy, "summary.json"), "utf8")).toBe(original);
  });
});

test("different metric denominators remain visible without withholding arithmetic differences", () => {
  const a = fixture(), b = clone(a);
  b.summary.metrics.defects.n++;
  const report = comparePair(a, b);
  for (const key of ["quality_percent", "metrics.defects.rate", "score:Correct fixes"])
    expect(report.rows.find(r => r.key === key)).toMatchObject({ delta: 0, note: "" });
});

test("stored wall times are displayed as recorded", () => {
  const a = fixture(), b = clone(a);
  a.summary.seconds = 10;
  b.summary.wall_seconds = 12;
  expect(comparePair(a, b).rows.find(r => r.key === "run_wall_s")).toMatchObject({ a: 10, b: 12, delta: 2, note: "" });
});


test("legacy public runs from one recorded collector compare without inventing a manifest", () => {
  const a = fixture("retrieval"), b = clone(a);
  for (const r of [a, b]) { delete r.summary.manifest; delete r.summary.status; r.summary.git_commit = "bacf627"; }
  a.summary.akm_version = "0.9.31"; b.summary.akm_version = "0.10.26101002";
  const before = JSON.stringify([a, b]);
  const report = comparePair(a, b);
  expect(report.rows.find(r => r.key === "metrics.search.ndcg_10")?.delta).toBe(0);
  expect(report.changes.find(c => c.field === "akm")).toBeDefined();
  expect(JSON.stringify([a, b])).toBe(before);
  b.summary.git_commit = "another";
  expect(comparePair(a, b).rows.find(r => r.key === "metrics.search.ndcg_10")?.delta).toBe(0);
});

test("stopped results show saved values and counts with explicit coverage", () => {
  const a = fixture(), b = clone(a);
  b.summary.status = "aborted"; b.summary.aborted_reason = "operator stopped";
  b.rows.pop(); b.summary.manifest.completion.scored.pop();
  const report = comparePair(a, b);
  expect(report.warnings.join(" ")).toContain("operator stopped");
  expect(report.rows.find(r => r.key === "quality_percent")).toMatchObject({ a: expect.any(Number), b: expect.any(Number), delta: 0 });
  expect(report.rows.find(r => r.key === "recorded")?.delta).toBe(-1);
});

test("unknown evals, incomplete metadata and missing samples still show stored metrics", () => {
  const a = fixture(), b = clone(a);
  for (const r of [a, b]) { r.summary.eval = "future-eval"; r.summary.manifest = { future: true }; r.samplesMissing = true; r.rows = []; }
  const report = comparePair(a, b);
  expect(report.rows.find(r => r.key === "metrics.defects.rate")?.a).toBeNumber();
  expect(report.rows.find(r => r.key === "metrics.defects.rate")?.delta).toBe(0);
  expect(report.warnings.join(" ")).toContain("samples.jsonl is missing");
});

test("cold and warm indexes display timings and the changed cache setting", () => {
  const a = fixture("retrieval"), b = clone(a);
  a.summary.semantic_index = "cold"; b.summary.semantic_index = "warm";
  a.summary.index_seconds = { semantic: 40 }; b.summary.index_seconds = { semantic: .2 };
  expect(comparePair(a, b).rows.find(r => r.key === "semantic_index_s")).toMatchObject({ a: 40, b: .2, delta: -39.8 });
});
