// The tests of pair-judge's spec (run.ts). What every eval that runs on lib/run.ts does the same way (the flags, the give-up rule, the files a run writes) is
// tested in lib/run.test.ts; these are what pair-judge adds: its one sandbox, its two workers, its config, its rows and its summary.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { HARNESS_VERSION, manifestProblems } from "../../../lib/manifest.ts";
import { redactConfig } from "../../../lib/provenance.ts";
import { casesSha256 } from "./inputs.ts";
import { type Case, judgeConfig } from "./lib.ts";
import { runCorpus } from "./run.ts";

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, FAKE_NOJUDGE: process.env.FAKE_NOJUDGE, FAKE_SCHEMA: process.env.FAKE_SCHEMA, MODEL_API_KEY: process.env.MODEL_API_KEY, TMPDIR: process.env.TMPDIR };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const BASE_URL = "http://localhost:9/v1";

/**
 * An akm whose judge reads the first word of note a and answers with that verdict. It logs the input it was given, the sandbox it runs in, the config it reads there
 * and the model key to FAKE_LOG, as the fake of judge-gate does.
 */
const FAKE_AKM = `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [a, b] = process.argv.slice(2);
const log = (o) => { if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify(o) + "\\n"); };
if (a === "--version") { console.log("0.10.261200-test"); process.exit(0); }
if (a === "judge" && b === "--list") {
  if (process.env.FAKE_NOJUDGE) { console.error("Unknown command judge"); process.exit(2); }
  console.log(JSON.stringify({ judges: [{ name: "consolidate.pair", schemaVersion: Number(process.env.FAKE_SCHEMA ?? 1) }] }));
  process.exit(0);
}
if (a !== "judge" || b !== "consolidate.pair") { console.error("unexpected " + process.argv.slice(2).join(" ")); process.exit(1); }
const input = JSON.parse(await Bun.stdin.text());
const word = String(input.a.content).split(" ")[0];
log({ at: "start", word, input, data: process.env.AKM_DATA_DIR, key: process.env.MODEL_API_KEY ?? null, config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")) });
const out = (verdict) => console.log(JSON.stringify({ judge: "consolidate.pair", schemaVersion: 1, runner: { kind: "connection", name: "judge", model: null }, outcome: "verdict", verdict }));
const none = (outcome, reason) => { console.log(JSON.stringify({ judge: "consolidate.pair", schemaVersion: 1, runner: { kind: "connection", name: "judge", model: null }, outcome, reason })); process.exit(1); };
const v = (relation, redundant, onlyInA, onlyInB) => ({ relation, redundant, onlyInA, onlyInB, confidence: 0.9, reason: "because" });
if (word === "DUP") out(v("duplicate", "A", [], []));
else if (word === "OVL") out(v("overlap", null, ["retry limit 5"], ["jobs-dead queue"]));
else if (word === "SUBA") out(v("subsumed", "A", [], ["jobs-dead queue"]));
else if (word === "SUBB") out(v("subsumed", "B", ["retry limit 5"], []));
else if (word === "NOVERDICT") none("error", "judge timeout");
else if (word === "UNREADABLE") none("unparseable", "the reply held no verdict in the expected shape");
else if (word === "LEAK") none("error", "connect to ${BASE_URL}/chat/completions failed");
else if (word === "HANG") await Bun.sleep(60000);
else { console.error("boom ${BASE_URL}/chat/completions"); process.exit(70); }
`;

const note = (ref: string, content: string) => ({ ref, type: "memory", created: "2026-11-01T00:00:00.000Z", updated: "2026-11-01T00:00:00.000Z", content });

/** A pair: a holds "the retry limit is 5", b "the dead queue is jobs-dead". `safe` and the claims follow from the kind. */
function caseOf(i: number, word: string, kind: "duplicate" | "subsumed" | "overlap" = "overlap"): Case {
  const a = note(`memories/a${i}`, `${word} The worker retries. The retry limit is 5.`);
  const b = note(`memories/b${i}`, `${word} The worker retries. Dead jobs go to the queue jobs-dead.`);
  return {
    id: `case-${i}`,
    kind,
    set: "pairs",
    source: "pair-pass",
    a,
    b,
    safe: kind === "duplicate" ? ["a", "b"] : kind === "subsumed" ? ["a"] : [],
    only_a: kind === "overlap" ? ["The retry limit is 5."] : [],
    only_b: kind === "duplicate" ? [] : ["Dead jobs go to the queue jobs-dead."],
    labelReason: "r",
  };
}

type Spec = { word: string; kind?: "duplicate" | "subsumed" | "overlap" };

/** Assets and a fake akm in a temp folder, and what the run needs of the environment: akm, its log, the model key, and a TMPDIR of its own, in which no sandbox may be left. */
function setup(specs: Spec[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "pair-judge-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${specs.map((s, i) => JSON.stringify(caseOf(i + 1, s.word, s.kind))).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const own = join(root, "tmp");
  mkdirSync(own);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  process.env.TMPDIR = own;
  Object.assign(process.env, env);
  const log = process.env.FAKE_LOG;
  const ctx = { baseUrl: BASE_URL, model: "the-model", hasKey: true, version: "0.10.261200-test", label: "t" };
  return { ctx, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []), leftover: () => readdirSync(own), folders: { assets, results: join(root, "results") } };
}

const corpus: (assets: string) => ResolvedCorpus = (assets) => ({ name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" });
const run = (ctx: Parameters<typeof runCorpus>[1], folders: { assets: string; results: string }) => quiet(() => runCorpus(corpus(folders.assets), ctx, folders.results));

async function quiet<T>(f: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
}

const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0] as string);
  return { dir, summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")), rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
};

describe("runCorpus", () => {
  test("scores retirements by whether the note was safe, kept pairs, judge failures apart from akm crashing, and leaves a crash out", async () => {
    const { ctx, folders } = setup([
      { word: "DUP", kind: "duplicate" }, // retires a, which is safe
      { word: "SUBA", kind: "subsumed" }, // retires a, which is safe
      { word: "SUBB", kind: "subsumed" }, // retires b, which holds the claim: unsafe
      { word: "OVL" }, // kept, right
      { word: "SUBA" }, // overlap pair judged subsumed: retires a, unsafe
      { word: "UNREADABLE" }, // no verdict: nothing retired
      { word: "CRASH" }, // akm failed
    ]);
    const summary = await run(ctx, folders);
    expect(summary).toMatchObject({ eval: "pair-judge", corpus: "public", model: "the-model", akm_version: "0.10.261200-test", n_cases: 7, n_run: 7, n_scored: 6, n_errored: 1, timeouts: 0, status: "complete", aborted_reason: null });
    const m = summary.metrics;
    expect(m.unsafe).toEqual({ n: 5, count: 2, rate: 0.4 });
    expect(m.found).toEqual({ n: 3, count: 2, rate: 0.6667 });
    expect(m.precision).toEqual({ value: 0.5, safe: 2, retired: 4 });
    expect(m.failed).toEqual({ n: 6, count: 1, rate: 0.1667 });
    expect(m.relation).toEqual({ n: 5, count: 3, rate: 0.6 });
    expect(m.claims).toMatchObject({ labelled: 6, found: 4, unlabelled: 1, unmatchable: 0 });

    const { dir, summary: stored, rows } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(stored.results_dir).toBeUndefined();
    const byId = (id: string) => rows.find((r) => r.id === id);
    expect(byId("case-3")).toMatchObject({ outcome: "retire", retired: "b", retired_safe: false, verdict: { schemaVersion: 1, relation: "subsumed" } });
    expect(byId("case-6")).toMatchObject({ outcome: "failed", reason: "the reply held no verdict in the expected shape", no_verdict: { outcome: "unparseable" } });
    expect(byId("case-6").error).toBeUndefined();
    expect(byId("case-7")).toMatchObject({ outcome: "error", error: expect.stringContaining("boom") });
  });

  test("gives the judge the two notes as the cases hold them, and nothing else", async () => {
    const { ctx, calls, folders } = setup([{ word: "OVL" }]);
    await run(ctx, folders);
    const input = calls().find((c) => c.at === "start").input;
    expect(Object.keys(input).sort()).toEqual(["a", "b"]);
    expect(input).toEqual({ a: caseOf(1, "OVL").a, b: caseOf(1, "OVL").b });
  });

  test("stops before the first case when the akm has no `akm judge`, whatever its version says", async () => {
    const { ctx, folders, calls } = setup([{ word: "OVL" }], { FAKE_NOJUDGE: "1" });
    await expect(run(ctx, folders)).rejects.toThrow("has no `akm judge consolidate.pair`");
    expect(calls().filter((c) => c.at === "start")).toEqual([]);
    expect(existsSync(folders.results) ? readdirSync(folders.results) : []).toEqual([]); // no empty results folder is left behind
  });

  test("stops before the first case when the akm's consolidate.pair is at another schemaVersion", async () => {
    const { ctx, folders, calls } = setup([{ word: "OVL" }], { FAKE_SCHEMA: "2" });
    await expect(run(ctx, folders)).rejects.toThrow("has schemaVersion 2, and this eval reads 1");
    expect(calls().filter((c) => c.at === "start")).toEqual([]);
  });

  test("a limit runs the kinds in turn", async () => {
    const { ctx, folders } = setup([{ word: "OVL" }, { word: "OVL" }, { word: "DUP", kind: "duplicate" }, { word: "SUBA", kind: "subsumed" }]);
    const summary = await run({ ...ctx, limit: 3 }, folders);
    expect(summary).toMatchObject({ limit: 3, n_cases: 4, n_run: 3 });
    expect(Object.keys(summary.metrics.by_kind).sort()).toEqual(["duplicate", "overlap", "subsumed"]);
  });

  test("masks the model endpoint in the rows and in the reason for giving up", async () => {
    const { ctx, folders } = setup([{ word: "CRASH" }, { word: "LEAK" }]);
    const summary = await run(ctx, folders);
    expect(summary).toMatchObject({ n_errored: 1 });
    const { rows, dir } = resultsOf(folders);
    expect(rows.find((r) => r.id === "case-1").error).toBe("akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(rows.find((r) => r.id === "case-2").no_verdict.reason).toBe("connect to <MODEL_BASE_URL>/chat/completions failed");
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8")).not.toContain("localhost:9");
    const dead = setup(Array.from({ length: 8 }, () => ({ word: "CRASH" })));
    await expect(run(dead.ctx, dead.folders)).rejects.toThrow("Last error: akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
  });

  test("a judge that gives no verdict five times in a row stops the run, as an error does; a verdict starts the count again", async () => {
    const dead = setup(Array.from({ length: 10 }, () => ({ word: "NOVERDICT" })));
    const message = await run(dead.ctx, dead.folders).then(() => "", (e: Error) => e.message);
    expect(message).toMatch(/^5 cases in a row gave no result, so the run stopped after [56] of 10\. Last error: judge timeout\n/);
    const { summary, rows } = resultsOf(dead.folders);
    expect(summary).toMatchObject({ status: "aborted", n_errored: 0 });
    expect(rows.every((r) => r.outcome === "failed")).toBe(true);
    expect(dead.leftover()).toEqual([]);
    const mixed = setup([...Array.from({ length: 4 }, () => ({ word: "NOVERDICT" })), { word: "OVL" }, ...Array.from({ length: 4 }, () => ({ word: "NOVERDICT" }))]);
    expect(await run({ ...mixed.ctx, concurrency: 1 }, mixed.folders)).toMatchObject({ status: "complete", n_run: 9 });
  });

  test("counts a case that akm did not answer in time as a timeout", async () => {
    const { ctx, folders } = setup([{ word: "HANG" }, { word: "CRASH" }, { word: "OVL" }]);
    const summary = await run({ ...ctx, timeoutMs: 600 }, folders);
    expect(summary).toMatchObject({ n_errored: 2, timeouts: 1, n_scored: 1, timeout_ms: 600 });
    const hung = resultsOf(folders).rows.find((r) => r.id === "case-1");
    expect(hung).toMatchObject({ outcome: "error", timed_out: true });
    expect(hung.error).toContain("timed out after 0.6s");
  });

  describe("the sandbox and the summary", () => {
    test("one sandbox serves all the cases, with the model key and the config the summary records, and it is gone when the run ends", async () => {
      const { ctx, calls, leftover, folders } = setup(Array.from({ length: 6 }, () => ({ word: "OVL" })));
      const summary = await run(ctx, folders);
      const started = calls().filter((c) => c.at === "start");
      expect(started).toHaveLength(6);
      expect(new Set(started.map((c) => c.data)).size).toBe(1);
      expect(started.every((c) => c.key === "model-secret")).toBe(true);
      expect(existsSync(started[0].data)).toBe(false);
      expect(leftover()).toEqual([]);
      expect(summary.config).toEqual(redactConfig(hideEndpoint(started[0].config, BASE_URL)));
      expect((summary.config as Record<string, any>).engines.judge).toMatchObject({ temperature: 0, enableThinking: false, apiKey: "$MODEL_API_KEY", endpoint: "<MODEL_BASE_URL>/chat/completions" });
      expect(judgeConfig(BASE_URL, "the-model", true).engines.judge.model).toBe("the-model");
    });

    test("records the digest of the cases and a manifest that holds together, and no strategy", async () => {
      const { ctx, folders } = setup([{ word: "OVL" }, { word: "DUP", kind: "duplicate" }]);
      await run(ctx, folders);
      const { summary } = resultsOf(folders);
      expect(summary.assets_sha256).toBe(casesSha256(folders.assets));
      expect(summary).toMatchObject({ seed: null, config_patch: null });
      expect(summary.strategy).toBeUndefined();
      expect(summary.manifest).toMatchObject({ manifest_version: 1, eval: "pair-judge", harness_version: HARNESS_VERSION, collector: { version: "0.1" } });
      expect(manifestProblems(summary.manifest)).toEqual([]);
      expect(Object.keys(summary.manifest.cases)).toEqual(["case-1", "case-2"]);
    });

    test("never a secret, and never the model endpoint", async () => {
      const { ctx, folders } = setup([{ word: "OVL" }]);
      const configPatch = { path: "patch.json", sha256: "cd".repeat(32), patch: { engines: { judge: { apiKey: "sk-real-secret" } } } };
      await run({ ...ctx, baseUrl: "https://user:hunter2@secret-host.example:8443/v1?key=SECRET-KEY", overrides: { strategy: "", configPatch } }, folders);
      const { dir } = resultsOf(folders);
      for (const file of ["summary.json", "samples.jsonl"]) {
        const text = readFileSync(join(dir, file), "utf8");
        for (const leak of ["sk-real-secret", "SECRET-KEY", "hunter2", "user:"]) expect(text).not.toContain(leak);
      }
    });
  });
});
