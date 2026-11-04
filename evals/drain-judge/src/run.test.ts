// The tests of drain-judge's spec (run.ts). What every eval that runs on lib/run.ts does the same way (the flags, the give-up rule, the files a run writes) is tested in
// lib/run.test.ts; these are what drain-judge adds: its sandbox, its config, its input, its rows and its summary.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type Case, judgeConfig } from "./lib.ts";
import { defaultResults, runCorpus } from "./run.ts";

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, FAKE_SCHEMA: process.env.FAKE_SCHEMA, FAKE_NOJUDGE: process.env.FAKE_NOJUDGE, MODEL_API_KEY: process.env.MODEL_API_KEY, TMPDIR: process.env.TMPDIR };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const BASE_URL = "http://localhost:9/v1";

/** An akm whose judge answers with the decision named in the proposal's content (its first word). It logs the input it was given when FAKE_LOG is set. */
const FAKE_AKM = `
import { appendFileSync } from "node:fs";
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("0.10.261200-test"); process.exit(0); }
if (a === "judge" && b === "--list") {
  if (process.env.FAKE_NOJUDGE) { console.error("Unknown command judge"); process.exit(2); }
  console.log(JSON.stringify({ judges: [{ name: "proposal.judgment", schemaVersion: Number(process.env.FAKE_SCHEMA ?? 1) }] }));
  process.exit(0);
}
if (a !== "judge" || b !== "proposal.judgment") { console.error("unexpected " + process.argv.slice(2).join(" ")); process.exit(1); }
const input = JSON.parse(await Bun.stdin.text());
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify(input) + "\\n");
const word = String(input.proposal.content).split(/\\s/).find((w) => /^[A-Z]+$/.test(w));
const runner = { kind: "connection", name: "judge", model: null };
const out = (decision) => console.log(JSON.stringify({ judge: "proposal.judgment", schemaVersion: 1, runner, outcome: "verdict", verdict: { decision, reason: "because " + decision } }));
const none = (outcome, reason) => console.log(JSON.stringify({ judge: "proposal.judgment", schemaVersion: 1, runner, outcome, reason }));
if (word === "ACCEPT") out("accept");
else if (word === "REJECT") out("reject");
else if (word === "DEFER") out("defer");
else if (word === "UNREADABLE") none("unparseable", "the reply held no decision of accept, reject or defer");
else if (word === "FAILED") none("error", "connect to ${BASE_URL}/chat/completions failed");
else if (word === "HANG") await Bun.sleep(60000);
else { console.error("boom"); process.exit(70); }
`;

type Spec = { word: string; category: Case["category"] };
const casesOf = (specs: Spec[]): Case[] =>
  specs.map((s, i) => ({
    id: `case-${i + 1}`, kind: "promotion", set: "s", origin: "real", label: s.category === "good" ? "good" : "bad", category: s.category, labelReason: "r", memory: `memories/m${i}`, bundle: "base", family: `m${i}`,
    input: { proposal: { ref: `bundle//knowledge/m${i}`, source: "consolidate", content: `---\ndescription: d\n---\n${s.word} text` }, reason: "needs-judgment", siblings: [], neighbours: [{ ref: "knowledge/n", description: "d", excerpt: "e" }] },
  }));

function setup(specs: Spec[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "drain-judge-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${casesOf(specs).map((r) => JSON.stringify(r)).join("\n")}\n`);
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

const corpusOf = (assets: string): ResolvedCorpus => ({ name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" });
const runPublic = (ctx: Parameters<typeof runCorpus>[1], folders: { assets: string; results: string }) => runCorpus(corpusOf(folders.assets), ctx, folders.results);
const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};
const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0] as string);
  return { dir, summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")), rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
};

describe("runCorpus", () => {
  test("scores what the drain would accept, reject and leave pending, keeps an unparseable reply in the counts and leaves a crash out", async () => {
    const { ctx, folders } = setup([
      { word: "ACCEPT", category: "good" },
      { word: "DEFER", category: "good" },
      { word: "ACCEPT", category: "ephemeral" },
      { word: "REJECT", category: "duplicate" },
      { word: "DEFER", category: "stale" },
      { word: "UNREADABLE", category: "stale" },
      { word: "CRASH", category: "ephemeral" },
      { word: "FAILED", category: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "drain-judge", corpus: "public", model: "the-model", akm_version: "0.10.261200-test", n_cases: 8, n_run: 8, n_scored: 6, n_errored: 2, status: "complete", aborted_reason: null, rubric_version: 1 });
    const m = summary.metrics;
    expect(m.good_accepted).toEqual({ n: 2, count: 1, rate: 0.5 });
    expect(m.bad_accepted).toEqual({ n: 4, count: 1, rate: 0.25 });
    expect(m.by_category.ephemeral).toEqual({ n: 1, count: 1, rate: 1 });
    expect(m.defer_rate.bad).toEqual({ n: 4, count: 1, rate: 0.25 });
    expect(m.left_pending.bad).toEqual({ n: 4, count: 2, rate: 0.5 });
    expect(m.unparseable_rate.count).toBe(1);
    expect(m.error_rate.count).toBe(2);
    const { rows, dir } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(rows).toHaveLength(8);
    expect(rows.find((r) => r.id === "case-8")).toMatchObject({ outcome: "error", error: "connect to <MODEL_BASE_URL>/chat/completions failed" });
    expect(rows.find((r) => r.id === "case-7")).toMatchObject({ outcome: "error", error: expect.stringContaining("boom") });
    expect(rows.find((r) => r.id === "case-6")).toMatchObject({ outcome: "unparseable", category: "stale", origin: "real" });
    expect(rows.find((r) => r.id === "case-1")).toMatchObject({ outcome: "accept", reason: "because accept", verdict: { schemaVersion: 1 } });
  });

  test("sends the judge the frozen input of the case, as it is", async () => {
    const specs: Spec[] = [{ word: "ACCEPT", category: "good" }];
    const { ctx, folders, calls } = setup(specs);
    await quiet(() => runPublic(ctx, folders));
    expect(calls()).toEqual([casesOf(specs)[0]?.input]);
  });

  test("stops before the first case when the akm has no `akm judge`, or its proposal.judgment is at another schemaVersion", async () => {
    const none = setup([{ word: "ACCEPT", category: "good" }], { FAKE_NOJUDGE: "1" });
    await expect(quiet(() => runPublic(none.ctx, none.folders))).rejects.toThrow("has no `akm judge proposal.judgment`");
    delete process.env.FAKE_NOJUDGE;
    const two = setup([{ word: "ACCEPT", category: "good" }], { FAKE_SCHEMA: "2" });
    await expect(quiet(() => runPublic(two.ctx, two.folders))).rejects.toThrow("has schemaVersion 2, and this eval reads 1");
    expect(existsSync(two.folders.results) ? readdirSync(two.folders.results) : []).toEqual([]);
  });

  test("a limit takes the categories in turn", async () => {
    const { ctx, folders } = setup(["good", "good", "ephemeral", "ephemeral", "duplicate", "stale"].map((category) => ({ word: "REJECT", category }) as Spec));
    const summary = await quiet(() => runPublic({ ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 6, n_run: 4 });
    expect(Object.values(summary.metrics.by_category).map((s: any) => s.n)).toEqual([1, 1, 1]);
  });

  test("counts a case that akm did not answer in time as a timeout", async () => {
    const { ctx, folders } = setup([{ word: "HANG", category: "good" }, { word: "REJECT", category: "stale" }]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 600 }, folders));
    expect(summary).toMatchObject({ n_errored: 1, timeouts: 1, timeout_ms: 600 });
    expect(resultsOf(folders).rows.find((r) => r.id === "case-1")).toMatchObject({ outcome: "error", timed_out: true });
  });

  test("the sandbox is one for the run, holds the model key and the config the summary records, and is gone after it", async () => {
    const { ctx, folders, leftover } = setup([{ word: "ACCEPT", category: "good" }, { word: "REJECT", category: "stale" }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(leftover()).toEqual([]);
    expect((summary.config as any).engines.judge).toMatchObject({ temperature: 0, enableThinking: false, model: "the-model", apiKey: "$MODEL_API_KEY" });
    expect(JSON.stringify(summary)).not.toContain("model-secret");
    expect(summary.manifest).toMatchObject({ harness_version: expect.any(Number) });
  });

  test("the summary has the keys the website, scripts/ledger, compare and rescore read", async () => {
    const { ctx, folders } = setup([{ word: "ACCEPT", category: "good" }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    for (const k of ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "limit", "config_patch", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "config", "engine", "assets_sha256", "rubric_version", "seed", "metrics", "model_calls", "manifest", "concurrency", "timeout_ms"]) {
      expect(Object.hasOwn(summary, k)).toBe(true);
    }
  });
});

describe("the config", () => {
  test("is one default LLM engine at temperature 0 with thinking off", () => {
    expect(judgeConfig(BASE_URL, "m", true).engines.judge).toMatchObject({ temperature: 0, enableThinking: false, model: "m", endpoint: `${BASE_URL}/chat/completions` });
  });
  test("the public results go to the eval's results folder", () => {
    expect(defaultResults({ name: "public", folder: "x", rewrite: false, seed: null, flag: "" })).toEndWith("/evals/drain-judge/results");
  });
});
