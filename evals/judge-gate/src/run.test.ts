// The tests of judge-gate's spec (run.ts). What every eval that runs on lib/run.ts does the same way (the flags, the give-up rule, the files
// a run writes) is tested in lib/run.test.ts; these are what judge-gate adds: its one sandbox, its two workers, its config, its rows and its summary.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { takeModelCalls } from "../../../lib/akm/usage.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { caseDigests, manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointHost, redactConfig, withoutEngineSettings } from "../../../lib/provenance.ts";
import { casesSha256 } from "./inputs.ts";
import { type Case, type Raw, judgeConfig, parseCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { defaultResults, runCorpus } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const REPO = join(EVAL_DIR, "..", "..");

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, FAKE_MS: process.env.FAKE_MS, FAKE_USAGE: process.env.FAKE_USAGE, MODEL_API_KEY: process.env.MODEL_API_KEY, TMPDIR: process.env.TMPDIR };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const BASE_URL = "http://localhost:9/v1";

/**
 * The keys of the summary.json that judge-gate wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts, without
 * results_dir, which is returned and not written. The website, scripts/ledger, compare and rescore read them, so none may go. A run adds
 * concurrency and timeout_ms to them.
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "limit", "strategy", "config_patch", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "config", "engine", "assets_sha256", "rubric_version", "seed", "metrics", "model_calls", "semantic_verification", "manifest"];

/**
 * An akm whose judge reads one word from the candidate and answers with that verdict. It logs to FAKE_LOG when it is set: when each call starts and
 * ends, the sandbox it runs in and the config it reads there, and the model key it was given. FAKE_MS makes a call last, and FAKE_USAGE records one
 * model call in the sandbox's state.db, as akm does.
 */
const FAKE_AKM = `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
const [a, b] = process.argv.slice(2);
const log = (o) => { if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify({ t: performance.now() + performance.timeOrigin, ...o }) + "\\n"); };
if (a === "--version") { log({ at: "version" }); console.log("0.9.99-test"); process.exit(0); }
if (a !== "improve" || b !== "judge") { console.error("unexpected " + process.argv.slice(2).join(" ")); process.exit(1); }
const input = JSON.parse(await Bun.stdin.text());
const word = String(input.candidate).split(" ")[0];
const seen = { feedback: input.feedback, env: process.env.AKM_CONFIG_DIR };
log({ at: "start", word, data: process.env.AKM_DATA_DIR, key: process.env.MODEL_API_KEY ?? null, config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")) });
await Bun.sleep(Number(process.env.FAKE_MS ?? 0));
if (process.env.FAKE_USAGE) {
  const db = new Database(join(process.env.AKM_DATA_DIR, "state.db"));
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("CREATE TABLE IF NOT EXISTS events (event_type TEXT, metadata_json TEXT)");
  db.query("INSERT INTO events VALUES ('llm_usage', ?)").run(JSON.stringify({ outcome: "success", durationMs: 10, promptTokens: 1, completionTokens: 1 }));
  db.close();
}
log({ at: "end", word });
if (word === "PASS") console.log(JSON.stringify({ ok: true, engine: "judge", pass: true, score: 4.5, criteria: { need: 5, preservation: 4, quality: 5 }, reason: JSON.stringify(seen) }));
else if (word === "REVIEW") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, reviewNeeded: true, score: 3, reason: "needs a person" }));
else if (word === "REJECT") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: 1.5, reason: "churn" }));
else if (word === "NOVERDICT") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "judge timeout/error" }));
else if (word === "UNREADABLE") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "judge parse failed — routed to review" }));
else if (word === "REWORDED") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "the model's reply was not understood" }));
else if (word === "FAILCLOSED") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reason: "no engine configured — cannot judge, failing closed" }));
else if (word === "LEAK") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: 1.5, reason: "connect to ${BASE_URL}/chat/completions failed" }));
else if (word === "HANG") await Bun.sleep(60000);
else { console.error("boom ${BASE_URL}/chat/completions"); process.exit(70); }
`;

type Spec = { word: string; label: "good" | "bad"; feedback?: string; severity?: "churn" | "harmful" };

/** The cases of a spec, as the cases file holds them. */
const casesOf = (cases: Spec[]): Case[] =>
  cases.map((c, i) => ({
    id: `case-${i + 1}`,
    kind: "reflect",
    set: "s",
    label: c.label,
    labelReason: "r",
    ...(c.label === "bad" ? { severity: c.severity ?? ("harmful" as const) } : {}),
    feedback: c.feedback ?? "",
    source: "source text",
    candidate: `${c.word} revised text`,
  }));

/** Assets and a fake akm in a temp folder, and what the run needs of the environment: akm, its log, the model key, and a TMPDIR of its own, in which no sandbox may be left. */
function setup(cases: Spec[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "judge-gate-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${casesOf(cases).map((r) => JSON.stringify(r)).join("\n")}\n`);
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
  const ctx = { baseUrl: BASE_URL, model: "the-model", hasKey: true, version: "0.9.99-test", label: "t" };
  return { ctx, calls: () => readCalls(log), leftover: () => readdirSync(own), folders: { assets, results: join(root, "results") } };
}

/** What the fake akm logged. */
const readCalls = (file: string): any[] => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);

/** The most calls that were running at once, from the start and end the fake logged for each. */
function mostAtOnce(calls: any[]): number {
  const edges = calls.filter((c) => c.at === "start" || c.at === "end").sort((x, y) => x.t - y.t || (x.at === "end" ? -1 : 1));
  let now = 0;
  let most = 0;
  for (const e of edges) most = Math.max(most, (now += e.at === "start" ? 1 : -1));
  return most;
}

/** A corpus read from `assets`: the public one, or a custom one that is a rewrite (with its seed) or your own. */
type Custom = { rewrite: boolean; seed: string | null };
const corpusOf = (assets: string, custom?: Custom): ResolvedCorpus => (custom ? { name: "custom", folder: assets, ...custom, flag: "--corpus custom" } : { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" });
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

/** The lines a run prints. */
async function printed<T>(f: () => Promise<T>): Promise<string[]> {
  const log = console.log;
  const lines: string[] = [];
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    await f();
  } catch {
    // a run that gives up fails after it has printed
  } finally {
    console.log = log;
  }
  return lines;
}

/** The one results folder a test made. */
const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0] as string);
  return {
    dir,
    summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
    rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
  };
};

const repeat = (n: number, spec: Spec): Spec[] => Array.from({ length: n }, () => spec);

describe("runCorpus", () => {
  test("counts passes per label, keeps review apart from reject, counts a reply with no verdict as a review, and leaves a crash out", async () => {
    const { ctx, folders } = setup([
      { word: "PASS", label: "good" },
      { word: "REVIEW", label: "good" },
      { word: "PASS", label: "bad" },
      { word: "REJECT", label: "bad" },
      { word: "NOVERDICT", label: "bad", severity: "churn" },
      { word: "CRASH", label: "bad", severity: "churn" },
      { word: "UNREADABLE", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "judge-gate", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 7, n_run: 7, n_scored: 6, n_errored: 1, timeouts: 0, status: "complete", aborted_reason: null });
    expect(summary.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
    expect(summary.metrics.good).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(summary.metrics.bad).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(summary.metrics.precision).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(summary.metrics.outcomes.good).toEqual({ pass: 1, review: 2, reject: 0, error: 0 });
    expect(summary.metrics.outcomes.bad).toEqual({ pass: 1, review: 1, reject: 1, error: 1 });

    const { dir, summary: stored, rows } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.id === "case-6")).toMatchObject({ outcome: "error", error: expect.stringContaining("boom") });
    expect(rows.find((r) => r.id === "case-5")).toMatchObject({ outcome: "review", score: null, reason: "judge timeout/error" });
    expect(rows.find((r) => r.id === "case-5").error).toBeUndefined();
  });

  test("splits the bad revisions the judge passed by severity, in the summary and in the samples", async () => {
    const { ctx, folders } = setup([
      { word: "PASS", label: "bad", severity: "churn" },
      { word: "PASS", label: "bad", severity: "churn" },
      { word: "REJECT", label: "bad", severity: "churn" },
      { word: "PASS", label: "bad", severity: "harmful" },
      { word: "REJECT", label: "bad", severity: "harmful" },
      { word: "REVIEW", label: "bad", severity: "harmful" },
      { word: "PASS", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary.metrics.bad).toEqual({ n: 6, passed: 3, rate: 0.5 });
    expect(summary.metrics.bad_churn).toEqual({ n: 3, passed: 2, rate: 0.6667 });
    expect(summary.metrics.bad_harmful).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    const { summary: stored, rows } = resultsOf(folders);
    expect(stored.metrics.bad_harmful.rate).toBe(0.3333);
    expect(stored.metrics.bad_churn.rate).toBe(0.6667);
    // Two cases run at a time and each row is appended when its case finishes, so the file is in completion order. Look the rows up by id.
    const severityOf = (id: string) => rows.find((r) => r.id === id).severity;
    expect(["case-1", "case-2", "case-3", "case-4", "case-5", "case-6", "case-7"].map(severityOf)).toEqual(["churn", "churn", "churn", "harmful", "harmful", "harmful", undefined]);
  });

  test("a score of -1 routed to review is a review whatever the message says, and one routed nowhere is an error", async () => {
    const { ctx, folders } = setup([
      { word: "UNREADABLE", label: "good" },
      { word: "NOVERDICT", label: "good" },
      { word: "REWORDED", label: "good" },
      { word: "FAILCLOSED", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ n_scored: 3, n_errored: 1, status: "complete" });
    expect(summary.metrics.good).toEqual({ n: 3, passed: 0, rate: 0 });
    expect(summary.metrics.outcomes.good).toEqual({ pass: 0, review: 3, reject: 0, error: 1 });
    expect(resultsOf(folders).rows.find((r) => r.id === "case-4")).toMatchObject({ outcome: "error", error: "no engine configured — cannot judge, failing closed" });
  });

  test("a limit runs a good/bad mix", async () => {
    const { ctx, folders } = setup([...repeat(4, { word: "PASS", label: "good" }), ...repeat(12, { word: "REJECT", label: "bad" })]);
    const summary = await quiet(() => runPublic({ ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 16, n_run: 4 });
    expect(summary.metrics.good.n).toBe(1);
    expect(summary.metrics.bad.n).toBe(3);
  });

  test("tells each case on a line: its label, outcome and seconds, the start of its id, and why it has no verdict", async () => {
    const { ctx, folders } = setup([{ word: "PASS", label: "good" }, { word: "NOVERDICT", label: "bad" }, { word: "CRASH", label: "bad" }, { word: "REJECT", label: "bad" }]);
    const lines = await printed(() => runPublic(ctx, folders));
    expect(lines).toContain("judge-gate (public): 4 of 4 cases, 2 at a time");
    const progress = lines.filter((l) => /^ {2}\[\d\/4\]/.test(l)).map((l) => l.replace(/^ {2}\[\d\/4\] /, "").replace(/ \d+(\.\d)?s /, " <N>s "));
    expect(progress.sort()).toEqual(["bad  error  <N>s  case-3  akm exited 70: boom <MODEL_BASE_URL>/chat/completions", "bad  reject <N>s  case-4", "bad  review <N>s  case-2  judge timeout/error", "good pass   <N>s  case-1"]);
  });

  test("masks the model endpoint in the error rows, in akm's reasons and in the reason for giving up", async () => {
    const { ctx, folders } = setup([{ word: "CRASH", label: "bad" }, { word: "LEAK", label: "bad" }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary.n_errored).toBe(1);
    const { rows, dir } = resultsOf(folders);
    expect(rows.find((r) => r.id === "case-1").error).toBe("akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(rows.find((r) => r.id === "case-2").reason).toBe("connect to <MODEL_BASE_URL>/chat/completions failed");
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8")).not.toContain("localhost:9");
    expect(readFileSync(join(dir, "summary.json"), "utf8")).not.toContain("localhost:9/v1"); // the summary has the host of the endpoint (engine), and never the path

    const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
    await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("Last error: akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(readFileSync(join(resultsOf(dead.folders).dir, "summary.json"), "utf8")).not.toContain("localhost:9/v1");
  });

  test("counts a case that akm did not answer in time as a timeout, apart from the other errors", async () => {
    const { ctx, folders } = setup([{ word: "HANG", label: "good" }, { word: "CRASH", label: "bad" }, { word: "PASS", label: "good" }]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 600 }, folders));
    expect(summary).toMatchObject({ n_errored: 2, timeouts: 1, n_scored: 1, timeout_ms: 600 });
    const { rows, summary: stored } = resultsOf(folders);
    expect(stored.timeouts).toBe(1);
    const hung = rows.find((r) => r.id === "case-1");
    expect(hung).toMatchObject({ outcome: "error", timed_out: true });
    expect(hung.error).toContain("timed out after 0.6s");
    expect(rows.find((r) => r.id === "case-2")).toMatchObject({ outcome: "error" });
    expect(rows.find((r) => r.id === "case-2").timed_out).toBeUndefined();
  });

  describe("the sandbox", () => {
    test("is one for all the cases of a run, with the model key and the config the summary records, and is gone when the run ends", async () => {
      const cases = repeat(6, { word: "PASS", label: "good", feedback: "[positive] fine\n[negative] stale" });
      const { ctx, calls, leftover, folders } = setup(cases);
      const summary = await quiet(() => runPublic(ctx, folders));
      const started = calls().filter((c) => c.at === "start");
      expect(started).toHaveLength(6);
      expect(new Set(started.map((c) => c.data)).size).toBe(1); // one sandbox, however many workers
      expect(started.every((c) => c.key === "model-secret")).toBe(true); // the config names the key as $MODEL_API_KEY, and akm is given it
      expect(existsSync(started[0].data)).toBe(false);
      expect(leftover()).toEqual([]);
      // the config in the summary is the config akm ran under, with the endpoint hidden and no secret
      expect(new Set(started.map((c) => JSON.stringify(c.config))).size).toBe(1);
      expect(summary.config).toEqual(redactConfig(hideEndpoint(started[0].config, BASE_URL)));
      // negative feedback goes first
      const seen = JSON.parse(resultsOf(folders).rows[0].reason);
      expect(seen.feedback).toBe("[negative] stale\n[positive] fine");
      expect(seen.env).toStartWith(started[0].data.replace(/data$/, ""));
    });

    test("is removed when the run gives up too, and the model calls it recorded are in the summary of a run that completes", async () => {
      takeModelCalls(); // another test's calls are not this one's
      const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
      await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("5 cases in a row errored");
      expect(dead.leftover()).toEqual([]);
      takeModelCalls();
      const { ctx, leftover, folders } = setup(repeat(5, { word: "PASS", label: "good" }), { FAKE_USAGE: "1" });
      const summary = await quiet(() => runPublic(ctx, folders));
      expect(summary.model_calls).toMatchObject({ calls: 5, errors: 0 }); // removing the sandbox counts its calls, before the summary takes them
      expect(leftover()).toEqual([]);
    });

    test("gives the cases of a run the config of its overrides: the strategy is the default, and the config patch is merged", async () => {
      const { ctx, calls, folders } = setup([{ word: "PASS", label: "good" }]);
      const configPatch = { path: "patches/tight.json", sha256: "ab".repeat(32), patch: { defaults: { improveStrategy: "tight" }, engines: { judge: { temperature: 0.3 } } } };
      const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "tight", configPatch } }, folders));
      const seen = calls().find((c) => c.at === "start").config;
      expect(seen.defaults.improveStrategy).toBe("tight");
      expect(seen.engines.judge.temperature).toBe(0.3);
      expect(summary.config).toEqual(redactConfig(hideEndpoint(seen, BASE_URL))); // the summary and the sandbox have one config
      expect(summary).toMatchObject({ strategy: "tight", config_patch: { path: "patches/tight.json", sha256: "ab".repeat(32) } });
    });
  });

  describe("giving up", () => {
    // The pool gives up on five errored rows in a row (lib/run.test.ts). judge-gate has always given up on five rows in a row that got no verdict,
    // and a review that akm routes there with a score of -1 (what a model that answers nothing the judge can read, or an endpoint that is down,
    // makes of every case) is not errored, so the pool counts none of them. lib/run.ts has no way for a spec to say which rows count: until it has,
    // this stays a todo (bun test --todo runs it).
    test.todo("five replies in a row that akm could not read stop the run, since the model gave no verdict either", async () => {
      const { ctx, folders } = setup(repeat(10, { word: "UNREADABLE", label: "bad" }));
      await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow();
      const { summary } = resultsOf(folders);
      expect(summary).toMatchObject({ status: "aborted", n_errored: 0 });
      expect(summary.n_run).toBeLessThan(10);
      expect(summary.metrics.bad.n).toBe(summary.n_run);
    });
  });

  describe("what the summary records of the run's inputs", () => {
    const cfg = judgeConfig(BASE_URL, "the-model", true);

    test("the effective config, the engine's settings, the cases' digest, the strategy and no seed for the public corpus", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      const summary = await quiet(() => runPublic(ctx, folders));
      const { summary: stored } = resultsOf(folders);
      expect(stored.config).toEqual(hideEndpoint(JSON.parse(JSON.stringify(cfg)), BASE_URL));
      expect(stored.config.engines.judge).toMatchObject({ temperature: 0, enableThinking: false, apiKey: "$MODEL_API_KEY", endpoint: "<MODEL_BASE_URL>/chat/completions" });
      const settings = { model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 };
      expect(stored.engine).toEqual({ engine: "judge", ...settings, engines: { judge: settings } });
      expect(stored.assets_sha256).toBe(casesSha256(folders.assets));
      expect(stored.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(stored).toMatchObject({ strategy: "default", config_patch: null, seed: null, status: "complete", aborted_reason: null, timeouts: 0 });
      expect(summary.assets_sha256).toBe(stored.assets_sha256);
    });

    test("never a secret", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      const configPatch = { path: "patch.json", sha256: "cd".repeat(32), patch: { engines: { judge: { apiKey: "sk-real-secret" } } } }; // a patch could put a key here
      await quiet(() => runPublic({ ...ctx, overrides: { strategy: "default", configPatch } }, folders));
      const text = readFileSync(join(resultsOf(folders).dir, "summary.json"), "utf8");
      expect(text).not.toContain("sk-real-secret");
      expect(JSON.parse(text).config.engines.judge.apiKey).toBe("<redacted>");
    });

    test("never the model endpoint, which can hold a key in its query or credentials, but its host in engine", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      await quiet(() => runPublic({ ...ctx, baseUrl: "https://user:hunter2@secret-host.example:8443/v1?key=SECRET-KEY" }, folders));
      const { dir } = resultsOf(folders);
      for (const file of ["summary.json", "samples.jsonl"]) {
        const text = readFileSync(join(dir, file), "utf8");
        for (const leak of ["SECRET-KEY", "hunter2", "user:"]) expect(text).not.toContain(leak);
      }
      const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(stored.config.engines.judge.endpoint).toBe("<MODEL_BASE_URL>/chat/completions");
      expect(stored.engine.endpoint).toBe("https://secret-host.example:8443"); // the host and port: never the path
    });

    test("the digest changes with the cases, and a rewrite records its seed", async () => {
      const a = setup([{ word: "PASS", label: "good" }]);
      const b = setup([{ word: "REJECT", label: "good" }]);
      const rewrite = corpusOf(a.folders.assets, { rewrite: true, seed: "12345678901234567890" });
      const one = await quiet(() => runCorpus(rewrite, a.ctx, a.folders.results));
      const two = await quiet(() => runPublic(b.ctx, b.folders));
      expect(one.assets_sha256).not.toBe(two.assets_sha256);
      expect(one).toMatchObject({ corpus: "custom", seed: "12345678901234567890" });
      expect(one.manifest).toMatchObject({ corpus: "custom", settings: { seed: "12345678901234567890" } });
      expect(two).toMatchObject({ corpus: "public", seed: null });
    });

    test("the version of the rubric the labels follow, from the public assets README, for either corpus and for a run that gave up", async () => {
      const readme = readFileSync(join(EVAL_DIR, "assets", "README.md"), "utf8");
      const version = Number(/^rubric_version: (\d+)$/m.exec(readme)?.[1]);
      expect(version).toBe(2);
      const pub = setup([{ word: "PASS", label: "good" }]);
      expect((await quiet(() => runPublic(pub.ctx, pub.folders))).rubric_version).toBe(version);
      expect(resultsOf(pub.folders).summary.rubric_version).toBe(version);
      const priv = setup([{ word: "PASS", label: "good" }]);
      expect((await quiet(() => runCorpus(corpusOf(priv.folders.assets, { rewrite: true, seed: "7" }), priv.ctx, priv.folders.results))).rubric_version).toBe(version);
      const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
      await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("5 cases in a row errored");
      expect(resultsOf(dead.folders).summary).toMatchObject({ status: "aborted", rubric_version: version });
    });
  });

  test("the summary has every key it has always had, which the website, scripts/ledger, compare and rescore read, and concurrency and timeout_ms besides", async () => {
    const { ctx, folders } = setup([{ word: "PASS", label: "good" }, { word: "REJECT", label: "bad" }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    const { summary: stored } = resultsOf(folders);
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms"].sort());
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(stored), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(stored).toMatchObject({ concurrency: 2, timeout_ms: 900_000, timeouts: 0, rubric_version: 2 });
  });
});

describe("the manifest of a run", () => {
  const specs: Spec[] = [
    { word: "PASS", label: "good" },
    { word: "REVIEW", label: "good" },
    { word: "REJECT", label: "bad" },
    { word: "NOVERDICT", label: "bad", severity: "churn" },
    { word: "FAILCLOSED", label: "bad" },
    { word: "CRASH", label: "bad" },
  ];

  test("is sound, names the parts the lock gives, and holds the digest of every selected case and what was scored", async () => {
    const { ctx, folders } = setup(specs);
    await quiet(() => runPublic(ctx, folders));
    const { summary: stored } = resultsOf(folders);
    const { manifest } = stored;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(stored).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "judge-gate", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: stored.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "default", config_patch_sha256: null, timeout_ms: 900_000, seed: null }); // the effective timeout of a case, which used to be recorded as null
    const loaded = parseCases(readFileSync(join(folders.assets, "cases.jsonl"), "utf8"));
    expect(Object.keys(manifest.cases)).toEqual(loaded.map((c) => c.id));
    expect(manifest.cases).toEqual(caseDigests(MEASUREMENT, loaded));
    const ids = loaded.map((c) => c.id);
    // a review that akm routed with a score of -1 is scored, and an error is not
    expect(manifest.completion).toEqual({ selected: ids, scored: ids.filter((id) => id !== "case-5" && id !== "case-6"), errored: ["case-5", "case-6"] });
    // the config without the engine's settings, and the engine with the digest of its endpoint
    expect(JSON.stringify(manifest.config.redacted)).not.toContain("localhost");
    expect(manifest.config.redacted).toEqual(withoutEngineSettings(stored.config));
    expect(manifest.engines).toEqual(stored.engine.engines);
    expect(manifest.engines.judge).toEqual({ model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 });
  });

  test("stores in every row the raw output the scorer reads: scored again from the row, a case gives the row it stored", async () => {
    const mixed: Spec[] = [{ word: "PASS", label: "good" }, { word: "REVIEW", label: "good" }, { word: "REJECT", label: "bad" }, { word: "NOVERDICT", label: "bad", severity: "churn" }, { word: "PASS", label: "good" }, { word: "FAILCLOSED", label: "bad" }, { word: "REVIEW", label: "good" }, { word: "CRASH", label: "bad" }, { word: "REJECT", label: "bad" }, { word: "HANG", label: "good" }, { word: "PASS", label: "good" }, { word: "UNREADABLE", label: "good" }];
    const { ctx, folders } = setup(mixed);
    await quiet(() => runPublic({ ...ctx, timeoutMs: 600 }, folders));
    const { rows } = resultsOf(folders);
    const byId = new Map(parseCases(readFileSync(join(folders.assets, "cases.jsonl"), "utf8")).map((c) => [c.id, c]));
    expect(rows.map((r) => r.outcome).sort()).toEqual(["error", "error", "error", "pass", "pass", "pass", "reject", "reject", "review", "review", "review", "review"]);
    expect(rows.some((r) => r.timed_out === true)).toBe(true);
    for (const row of rows) {
      const read = MEASUREMENT.rawOf(row);
      expect({ id: row.id, missing: "missing" in read ? read.missing : [] }).toEqual({ id: row.id, missing: [] });
      expect(MEASUREMENT.score(byId.get(row.id) as Case, (read as { raw: Raw }).raw)).toEqual(row);
    }
    // what akm printed is in the row, as the scorer read it, with the endpoint masked and only the fields it reads
    expect(rows.find((r) => r.id === "case-2").verdict).toEqual({ pass: false, score: 3, reviewNeeded: true, reason: "needs a person", engine: "judge" });
    expect(rows.find((r) => r.id === "case-4").verdict).toEqual({ pass: false, score: -1, reviewNeeded: true, reason: "judge timeout/error", engine: "judge" });
    expect(rows.find((r) => r.id === "case-8")).not.toHaveProperty("verdict"); // akm printed none
  });
});

describe("the command", () => {
  /** A copy of the code and the rubric in a temp folder, so that the run's private/ and results are there and never in the repository. */
  function copyOfRepo(): string {
    const tree = mkdtempSync(join(tmpdir(), "judge-gate tree-"));
    dirs.push(tree);
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL_DIR, "src"), join(tree, "evals", "judge-gate", "src"), { recursive: true, filter: keep });
    mkdirSync(join(tree, "evals", "judge-gate", "assets"), { recursive: true });
    cpSync(join(EVAL_DIR, "assets", "README.md"), join(tree, "evals", "judge-gate", "assets", "README.md"));
    return tree;
  }

  test("runs two cases at a time through one sandbox with 15 minutes for each; --concurrency and --timeout-ms change those, and the summary records them", () => {
    const tree = copyOfRepo();
    const notes = join(tree, "notes");
    mkdirSync(notes);
    writeFileSync(join(notes, "cases.jsonl"), `${casesOf(Array.from({ length: 8 }, (_, i) => ({ word: "PASS", label: i % 2 ? ("bad" as const) : ("good" as const) }))).map((c) => JSON.stringify(c)).join("\n")}\n`);
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const run = (label: string, flags: string[]) => {
      const [log, own] = [join(tree, `${label}.calls.jsonl`), join(tree, `${label}.tmp`)];
      mkdirSync(own);
      const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "model-secret", AKM_BIN: commandLine(["bun", script]), FAKE_LOG: log, FAKE_MS: "300", TMPDIR: own };
      const done = Bun.spawnSync(["bun", join(tree, "evals", "judge-gate", "src", "run.ts"), "--cases", notes, "--label", label, ...flags], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
      const results = join(tree, "private", "judge-gate", "results");
      const folder = join(results, readdirSync(results).find((name) => name.endsWith(`-${label}`)) as string);
      return { code: done.exitCode, err: done.stderr.toString(), calls: readCalls(log), leftover: readdirSync(own), stored: JSON.parse(readFileSync(join(folder, "summary.json"), "utf8")) };
    };
    const plain = run("defaults", []);
    const set = run("flags", ["--concurrency", "1", "--timeout-ms", "20000"]);
    for (const r of [plain, set]) {
      expect([r.code, r.err]).toEqual([0, ""]);
      expect(r.calls.filter((c) => c.at === "version")).toHaveLength(1); // akm is probed once
      expect(new Set(r.calls.filter((c) => c.at === "start").map((c) => c.data)).size).toBe(1); // and the eight cases go through one sandbox
      expect(r.leftover).toEqual([]); // which is removed, the probe's too
      expect(r.stored).toMatchObject({ n_run: 8, status: "complete", rubric_version: 2 });
      expect(Object.keys(r.stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    }
    expect([mostAtOnce(plain.calls), plain.stored.concurrency, plain.stored.timeout_ms, plain.stored.manifest.settings.timeout_ms]).toEqual([2, 2, 900_000, 900_000]);
    expect([mostAtOnce(set.calls), set.stored.concurrency, set.stored.timeout_ms, set.stored.manifest.settings.timeout_ms]).toEqual([1, 1, 20_000, 20_000]);
  }, 60_000);

  test("the results of a corpus go where the README says: the eval's results/ for the public cases, private/judge-gate/results/ for a custom corpus", () => {
    const corpus = (name: "public" | "custom"): ResolvedCorpus => ({ name, folder: "x", rewrite: false, seed: null, flag: `--corpus ${name}` });
    expect(defaultResults(corpus("public"), REPO)).toBe(join(REPO, "evals", "judge-gate", "results"));
    expect(defaultResults(corpus("custom"), REPO)).toBe(join(REPO, "private", "judge-gate", "results"));
  });
});

describe("the usage text", () => {
  test("names the flags, says what the private corpus is and the akm it needs, and has the two workers and the 15 minutes as defaults", () => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), "--help"], { stdout: "pipe", stderr: "pipe" });
    const text = done.stdout.toString();
    expect(done.exitCode).toBe(0);
    expect(text).toStartWith("Usage: evals/judge-gate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]\n");
    expect(text).toContain("--strategy      the akm improve strategy to run in place of default");
    expect(text).toContain("--config-patch  FILE");
    expect(text).toContain("not held-out data");
    expect(text).toContain("  --limit   run N cases, in the good/bad proportion of the whole set, with at least one of each from 2 cases on\n");
    expect(text).toContain("  --concurrency  run N cases at a time");
    expect(text).toContain("Default: 2.\n");
    expect(text).toContain("  --timeout-ms   stop an akm command that is still running after N milliseconds. Default: 900000.\n");
    expect(text).toEndWith("\n\nTested with akm 0.9.25-alpha.2 or later on PATH, or in AKM_BIN.\n");
    expect(text).not.toMatch(/--yes|-y\b/);
  });
});
