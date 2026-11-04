import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agreementOf, comparePair, loadRun, renderPair, type Run } from "./lib.ts";

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
  test("a run saved before 0.7.1 (treatment_hints) and one saved after (eval_settings) compare their eval settings by value, not by name", () => {
    const a = fixture("consolidate"), b = clone(a);
    const hints = a.summary.manifest.treatment_hints;
    expect(hints).toBeDefined(); // the fixture is a manifest of the old shape
    expect(a.summary.manifest.eval_settings).toBeUndefined();
    delete b.summary.manifest.treatment_hints;
    b.summary.manifest.eval_settings = { ...hints };
    expect(comparePair(a, b).changes.map(c => c.field)).not.toContain("benchmark_settings");
    b.summary.manifest.eval_settings = { embedder: "real" };
    expect(comparePair(a, b).changes.find(c => c.field === "benchmark_settings")).toEqual({ field: "benchmark_settings", a: hints, b: { embedder: "real" } });
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

describe("per-case agreement", () => {
  /** A run of samples that have a case id and an outcome, "pass" and "reject" spelled p and r. */
  const outcomes = (text: string): Run => ({ dir: "x", summary: {}, rows: [...text].map((o, i) => ({ id: `c${i + 1}`, outcome: ({ p: "pass", r: "reject", v: "review" } as Record<string, string>)[o] })) });
  const set = (...texts: string[]): Run => ({ dir: "set", summary: {}, rows: [], repeats: texts.map(t => outcomes(t)) });

  test("two runs that differ in 2 of 10 cases: 80% the same, kappa 0.6 (chance agreement 0.5), and the flipped cases", () => {
    // A: 5 pass, 5 reject. B: 5 pass, 5 reject, with c5 and c10 turned round. pe = .5*.5 + .5*.5 = .5, kappa = (.8 - .5) / (1 - .5).
    const g = agreementOf(outcomes("ppppprrrrr"), outcomes("pppprrrrrp"))!;
    expect(g).toMatchObject({ cases: 10, same: 8, share: 0.8, a: "one run", b: "one run" });
    expect(g.kappa).toBeCloseTo(0.6, 10);
    expect(g.flips).toEqual([{ id: "c5", a: "pass", b: "reject" }, { id: "c10", a: "reject", b: "pass" }]);
  });

  test("three outcomes: 5 of 8 the same, kappa 3/7 (chance agreement 22/64)", () => {
    const g = agreementOf(outcomes("pprrvvpr"), outcomes("prrrvppv"))!;
    expect(g).toMatchObject({ cases: 8, same: 5, share: 0.625 });
    expect(g.kappa).toBeCloseTo(3 / 7, 10);
    expect(g.flips.map(f => `${f.id}:${f.a}>${f.b}`)).toEqual(["c2:pass>reject", "c6:review>pass", "c8:reject>review"]);
  });

  test("identical runs have kappa 1; a single outcome on both sides leaves kappa undefined", () => {
    expect(agreementOf(outcomes("prvr"), outcomes("prvr"))).toMatchObject({ share: 1, kappa: 1, flips: [] });
    expect(agreementOf(outcomes("pppp"), outcomes("pppp"))).toMatchObject({ share: 1, kappa: null });
  });

  test("a --repeat set counts for each case's majority outcome; a case with no majority, and a case one side lacks, are left out and counted", () => {
    // Three runs of c1..c3: c1 is p p r (pass), c2 is r r r (reject), c3 is p r v (no majority). B has c4, which the set lacks.
    const g = agreementOf(set("ppp", "prr", "rrv"), outcomes("prvr"))!;
    expect(g.a).toBe("the majority of 3 runs");
    expect(g).toMatchObject({ cases: 2, same: 2, no_majority: { a: 1, b: 0 }, only: { a: 0, b: 1 } });
  });

  test("an errored row is a crash, not an outcome: the case is left out and counted, and in a --repeat set the run does not vote", () => {
    const withError = (text: string, errorAt: number[]): Run => { const r = outcomes(text); for (const i of errorAt) r.rows[i]!.outcome = "error"; return r; };
    const g = agreementOf(withError("pprr", [1]), outcomes("pprr"))!;
    expect(g).toMatchObject({ cases: 3, same: 3, errored: { a: 1, b: 0 }, flips: [] });
    // c1: p, error, error -> p; c2: error in every run -> errored.
    const s = agreementOf({ dir: "set", summary: {}, rows: [], repeats: [withError("pp", [1]), withError("pp", [0, 1]), withError("pp", [0, 1])] }, outcomes("pp"))!;
    expect(s).toMatchObject({ cases: 1, same: 1, errored: { a: 1, b: 0 }, no_majority: { a: 0, b: 0 } });
    expect(renderPair({ ...comparePair(fixture("judge-gate"), fixture("judge-gate", "after")), agreement: g })).toContain("Left out: errored (A 1, B 0).");
    // a case that errored on both sides is left out once, so it is not summed into one total
    const both = agreementOf(withError("pp", [0]), withError("pp", [0]))!;
    expect(renderPair({ ...comparePair(fixture("judge-gate"), fixture("judge-gate", "after")), agreement: both })).toContain("Left out: errored (A 1, B 1).");
  });

  test("runs whose samples carry no outcome have no agreement; rows of an eval that does are shown by compare", () => {
    expect(agreementOf({ dir: "x", summary: {}, rows: [{ id: "a" }] }, outcomes("p"))).toBeUndefined();
    const a = fixture("judge-gate"), b = fixture("judge-gate", "after");
    const g = comparePair(a, b).agreement;
    expect(g?.cases).toBe(a.rows.length);
    expect(renderPair(comparePair(a, b))).toContain("Per-case agreement (A: one run; B: one run)");
  });

  test("a repeat-summary.json loads as its runs: compare shows the mean of their metrics and the majority outcomes", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-repeat-")); folders.push(dir);
    for (const [i, side] of [["r1", "before"], ["r2", "after"]]) cpSync(join(fixtures, "judge-gate", side!), join(dir, `x-${i}`), { recursive: true });
    writeFileSync(join(dir, "2026-01-01-x-repeat-summary.json"), JSON.stringify({ eval: "judge-gate", label: "x", repeat: 2, runs: ["x-r1", "x-r2"], metrics: { good: { passed: { min: 1, max: 3, mean: 2 }, n: { min: 5, max: 5, mean: 5 } } } }));
    const set = loadRun(join(dir, "2026-01-01-x-repeat-summary.json"));
    expect(set.repeats?.length).toBe(2);
    expect(set.summary.metrics).toEqual({ good: { passed: 2, n: 5 } });
    expect(set.summary.label).toBe("x (mean of 2 runs)");
    expect(agreementOf(fixture("judge-gate"), set)?.b).toBe("the majority of 2 runs");
    expect(comparePair(fixture("judge-gate"), set).warnings).toContain(`${dir}: a --repeat set of 2 runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.`);
  });

  test("a malformed repeat-summary.json is an error, not a mean of 0 runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "compare-repeat-bad-")); folders.push(dir);
    for (const [name, body] of Object.entries({ empty: { repeat: 0, runs: [], metrics: {} }, nometrics: { repeat: 1, runs: ["x"] }, badruns: { repeat: 2, runs: "x" } })) {
      writeFileSync(join(dir, `${name}-repeat-summary.json`), JSON.stringify(body));
      expect(() => loadRun(join(dir, `${name}-repeat-summary.json`))).toThrow("a repeat summary needs");
    }
  });
});
