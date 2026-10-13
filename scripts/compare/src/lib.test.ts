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
  test("suppresses quality deltas for unequal scored cases even when counts match", () => {
    const a = fixture(), b = clone(a);
    a.summary.manifest.completion.errored = [a.rows[0]!.id];
    b.summary.manifest.completion.errored = [b.rows[1]!.id];
    for (const r of [a, b]) r.summary.manifest.completion.scored = r.rows.map(row => row.id).filter(id => !r.summary.manifest.completion.errored.includes(id));
    const report = comparePair(a, b);
    expect(report.rows.find(r => r.key === "quality_percent")!.delta).toBeNull();
    expect(report.rows.find(r => r.key === "errors")!.delta).toBe(0);
    expect(report.warnings.join(" ")).toContain("coverage");
  });
  test("unequal timing records suppress time deltas and keep stored values", () => {
    const a = fixture(), b = clone(a);
    delete b.rows[0]!.seconds;
    const row = comparePair(a, b).rows.find(r => r.key === "case_mean_s")!;
    expect(row.a).toBe(1);
    expect(row.b).toBe(1);
    expect(row.delta).toBeNull();
  });
  test("unrecorded telemetry stays missing; recorded zero stays zero", () => {
    const a = fixture(), b = clone(a);
    b.summary.model_calls = { calls: 0, errors: 0, prompt_tokens: null, completion_tokens: null, seconds: 0, output_tokens_per_second: null };
    const report = comparePair(a, b);
    expect(report.rows.find(r => r.key === "model_mean_request_s")).toMatchObject({ a: null, b: 0, delta: null });
    expect(report.rows.some(r => r.key === "model_output_tokens_per_s")).toBe(false);
  });
  test("malformed, duplicate, incomplete and unmanifested files fail clearly", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-")); folders.push(dir);
    const source = join(fixtures, "reflect", "before"); cpSync(source, dir, { recursive: true });
    writeFileSync(join(dir, ".running"), ""); expect(() => loadRun(dir)).toThrow("still being written"); rmSync(join(dir, ".running"));
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8");
    writeFileSync(join(dir, "samples.jsonl"), rows + rows); expect(() => loadRun(dir)).toThrow("duplicate");
    writeFileSync(join(dir, "samples.jsonl"), "{bad}"); expect(() => loadRun(dir)).toThrow("invalid JSON");
    writeFileSync(join(dir, "samples.jsonl"), rows);
    const summary = fixture().summary; delete summary.manifest;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary)); expect(() => loadRun(dir)).toThrow("before akm-eval 0.2");
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
  });
});

test("different metric denominators suppress named and raw rate deltas", () => {
  const a = fixture(), b = clone(a);
  b.summary.metrics.defects.n++;
  const report = comparePair(a, b);
  for (const key of ["quality_percent", "metrics.defects.rate", "score:Correct fixes"])
    expect(report.rows.find(r => r.key === key)).toMatchObject({ delta: null, note: "Unequal metric denominators" });
});

test("full runner wall time is not subtracted from older collector-only timing", () => {
  const a = fixture(), b = clone(a);
  a.summary.seconds = 10;
  b.summary.wall_seconds = 12;
  expect(comparePair(a, b).rows.find(r => r.key === "run_wall_s")).toMatchObject({ a: 10, b: 12, delta: null, note: "Different wall-time measurements" });
});
