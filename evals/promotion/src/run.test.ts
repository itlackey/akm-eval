// The tests of promotion's spec (run.ts). What every eval that runs on lib/run.ts does the same way (the flags, the files a run writes, the
// side-by-side table) is tested in lib/run.test.ts; these are what promotion adds: its one sandbox and one drain, its batch, the akm commands it
// plants and reads with, its abort, its config, its rows and its summary.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { commandLine, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { digestTree } from "../../../lib/akm/index-cache.ts";
import { Fatal } from "../../../lib/cli.ts";
import { type ResolvedCorpus, resolveCorpora } from "../../../lib/corpus.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointHost, sha256Json } from "../../../lib/provenance.ts";
import { clearRunning } from "../../../lib/results.ts";
import { type Run, comparePair, loadRun } from "../../../scripts/compare/src/lib.ts";
import { rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { type Case, assetsSha256, bundleSha256, callStats, digestOf, parseCases, plant } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { defaultResults, runCorpus } from "./run.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const REPO = resolve(EVAL_DIR, "..", "..");

const dirs: string[] = [];
const ENV = ["AKM_BIN", "FAKE_LOG", "FAKE_OUT", "FAKE_BASE_URL", "FAKE_STRATEGY", "FAKE_VERDICTS", "FAKE_PROPOSALS_DDL", "FAKE_NO_EVENTS", "FAKE_BUNDLE", "FAKE_FAIL", "FAKE_DRAIN_MS", "TMPDIR"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** A temporary folder, removed after the test. */
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "promotion-root-"));
  dirs.push(d);
  return d;
};

const BASE_URL = "http://localhost:1/v1";

/** The last line of every usage text: what the driver says of its one request to the model (lib/run.ts). */
const PROBE_NOTE = "The model gets one one-token request before the first case. AKM_EVAL_NO_PROBE=1 skips it, for an endpoint that does not serve chat completions.";

/**
 * The keys of the summary.json that promotion wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts, without
 * results_dir, which is returned and not written. The website, scripts/ledger, compare and rescore read them, so none may go. A run adds timeout_ms
 * to them. It adds no concurrency: promotion has one drain and no pool, and lib/run.ts writes none for an eval that runs its own cases (collectAll).
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "status", "aborted_reason", "n_cases", "n_run", "n_errored", "timeouts", "seconds", "calls", "metrics", "model_calls", "semantic_verification", "manifest"];

/**
 * An akm with akm's proposals table. Its drain reads the first word of each pending proposal's body as the verdict: ACCEPT, REJECT, DEFER, SLOW
 * or CRASH, which fail the model call and leave the proposal undecided. It logs every command to FAKE_LOG, with the sandbox it ran in and the
 * embedder's folder, and leaves what it saw in FAKE_OUT, since the sandbox is gone when the run ends. FAKE_DRAIN_MS makes the drain last, FAKE_FAIL=rejected
 * makes listing the rejected proposals fail with the endpoint in its message, and FAKE_BUNDLE is the bundle it lists the proposals of.
 */
const FAKE_AKM = `
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const has = (w) => args.includes(w);
const data = process.env.AKM_DATA_DIR;
const dbPath = join(data, "state.db");
const out = (x) => console.log(JSON.stringify(x));
const log = (o) => { if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify({ ...o, data, hf: process.env.HF_HOME ?? null }) + "\\n"); };
const keep = (name, value) => { if (process.env.FAKE_OUT) writeFileSync(join(process.env.FAKE_OUT, name), JSON.stringify(value)); };
if (args[0] === "--version") { log({ cmd: "version" }); console.log("0.9.99-test"); process.exit(0); }
if (args[0] === "index") {
  log({ cmd: "index", args });
  const db = new Database(dbPath);
  // FAKE_PROPOSALS_DDL lays the table out another way, and FAKE_NO_EVENTS leaves the events table out, like an akm build with another schema.
  db.run(process.env.FAKE_PROPOSALS_DDL ?? "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, stash_dir TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', frontmatter_json TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
  if (!process.env.FAKE_NO_EVENTS) db.run("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, ts TEXT NOT NULL, ref TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
  // Like akm's index: how many assets it found, and how many it embedded. The embedder is off unless the config turns it on.
  const count = (d) => existsSync(d) ? readdirSync(d, { recursive: true }).filter((f) => String(f).endsWith(".md")).length : 0;
  const total = count(join(process.env.AKM_BUNDLE_DIR, "knowledge")) + count(join(process.env.AKM_BUNDLE_DIR, "memories"));
  const config = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  const embedded = config.semanticSearchMode === "auto" && config.embedding?.localModel ? total : 0;
  keep("indexed.json", { memories: existsSync(join(process.env.AKM_BUNDLE_DIR, "memories")) ? readdirSync(join(process.env.AKM_BUNDLE_DIR, "memories")).sort() : [] });
  out({ ok: true, totalEntries: total, verification: { embeddingCount: embedded, message: "embedded" } });
  process.exit(0);
}
const db = new Database(dbPath);
const bundle = process.env.FAKE_BUNDLE ?? process.env.AKM_BUNDLE_DIR;
const pending = () => db.query("SELECT id, ref, content FROM proposals WHERE status = 'pending' AND stash_dir = ?").all(bundle);
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "pending") { log({ cmd: "list", status: "pending" }); out({ totalCount: pending().length, proposals: [] }); process.exit(0); }
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "rejected") {
  log({ cmd: "list", status: "rejected" });
  if (process.env.FAKE_FAIL === "rejected") { console.error("could not reach " + process.env.FAKE_BASE_URL + "/chat/completions"); process.exit(3); }
  out({ proposals: JSON.parse(readFileSync(join(data, "rejected.json"), "utf8")) });
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "drain") {
  log({ cmd: "drain", args });
  if (!has("--judgment") || args[args.indexOf("--strategy") + 1] !== (process.env.FAKE_STRATEGY ?? "promotion") || has("--promote")) { console.error("unexpected " + args.join(" ")); process.exit(2); }
  await Bun.sleep(Number(process.env.FAKE_DRAIN_MS ?? 0));
  const bundleDir = process.env.AKM_BUNDLE_DIR;
  keep("seen.json", { config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")), library: existsSync(join(bundleDir, "knowledge")) ? readdirSync(join(bundleDir, "knowledge")).sort() : [] });
  const result = { ok: true, staged: [], rejected: [], deferred: [], failed: [] };
  const rejected = [];
  for (const p of pending()) {
    // FAKE_VERDICTS names the verdict of a ref, for the public cases, whose text carries none
    const word = JSON.parse(process.env.FAKE_VERDICTS ?? "{}")[p.ref.split("//")[1]] ?? p.content.split("\\n\\n").pop().split(/\\s/)[0];
    const usage = (outcome) => { if (!process.env.FAKE_NO_EVENTS) db.run("INSERT INTO events (event_type, ts, metadata_json) VALUES ('llm_usage', ?, ?)", [new Date().toISOString(), JSON.stringify({ outcome, model: "served-model" })]); };
    if (word === "ACCEPT") { result.staged.push(p.id); usage("success"); }
    else if (word === "REJECT") { result.rejected.push(p.id); rejected.push({ id: p.id, review: { reason: "a duplicate of a note" } }); usage("success"); }
    else if (word === "SLOW") { console.error("[triage] judgment dispatch failed for " + p.id + ": LLM request timed out after 600000ms"); result.deferred.push({ id: p.id, reason: "needs-judgment" }); usage("error"); }
    else if (word === "CRASH") { console.error("[triage] judgment dispatch failed for " + p.id + ": LLM request failed: http://localhost:1/v1/chat/completions refused"); result.deferred.push({ id: p.id, reason: "needs-judgment" }); usage("error"); }
    else { result.deferred.push({ id: p.id, reason: "needs-judgment" }); usage("success"); }
  }
  writeFileSync(join(data, "rejected.json"), JSON.stringify(rejected));
  out(result);
  process.exit(0);
}
console.error("unexpected " + args.join(" "));
process.exit(2);
`;

const make = (id: string, category: Case["category"], word: string): Case => ({ id, label: category === "good" ? "good" : "bad", category, ref: `knowledge/${id}`, content: `---\ndescription: ${id}\n---\n\n${word} the body of ${id}\n` });

/** What the fake akm logged, and what it left in FAKE_OUT. */
const readCalls = (file: string): any[] => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const readOut = (dir: string, name: string): any => JSON.parse(readFileSync(join(dir, name), "utf8"));

/**
 * A folder of cases.jsonl and library/ and a fake akm in a temp folder, and what the run needs of the environment: akm, its log and its output
 * folder, and a TMPDIR of its own, in which no sandbox may be left. `env` adds to the fake's.
 */
function setup(cases: Case[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "promotion-run-"));
  dirs.push(root);
  mkdirSync(join(root, "library", "knowledge"), { recursive: true });
  for (const f of ["kept", ...cases.map((c) => c.id)]) writeFileSync(join(root, "library", "knowledge", `${f}.md`), `note ${f}\n`);
  writeFileSync(join(root, "cases.jsonl"), cases.map((c) => `${JSON.stringify(c)}\n`).join(""));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const [out, own] = [join(root, "out"), join(root, "tmp")];
  mkdirSync(out);
  mkdirSync(own);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.FAKE_OUT = out;
  process.env.FAKE_BASE_URL = BASE_URL;
  process.env.TMPDIR = own;
  Object.assign(process.env, env);
  const log = process.env.FAKE_LOG;
  const ctx = { baseUrl: BASE_URL, model: "the-model", hasKey: false, version: "0.9.99-test", label: "t" };
  return { ctx, calls: () => readCalls(log), seen: (name: string) => readOut(out, name), leftover: () => readdirSync(own), folders: { cases: join(root, "cases.jsonl"), library: join(root, "library"), results: join(root, "results") } };
}

/** What a run prints and what it says on stderr, for a test that reads them. */
async function loud<T>(f: () => Promise<T>): Promise<{ result: T | undefined; error?: unknown; out: string[]; err: string[] }> {
  const [log, error] = [console.log, console.error];
  const [out, err]: string[][] = [[], []];
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  console.error = (...a: unknown[]) => void err.push(a.join(" "));
  try {
    return { result: await f(), out, err };
  } catch (e) {
    return { result: undefined, error: e, out, err };
  } finally {
    [console.log, console.error] = [log, error];
  }
}

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

/** The public corpus held in `root`, which holds cases.jsonl and library/. */
const publicAt = (root: string): ResolvedCorpus => ({ name: "public", folder: root, rewrite: false, seed: null, flag: "--corpus public" });

/** The custom corpus that `--cases DIR` names, resolved the way the command does it, in a repository root of its own. */
const customAt = (dir: string, root: string): ResolvedCorpus => resolveCorpora({ eval: "promotion", values: { cases: dir }, publicFolder: join(root, "assets"), rewrite: false, root })[0] as ResolvedCorpus;

/** runCorpus on the public corpus that `folders` describes: the folder of cases.jsonl and library/, and where the results go. */
const runPublic = (ctx: Parameters<typeof runCorpus>[1], folders: { cases: string; results: string }) => runCorpus(publicAt(dirname(folders.cases)), ctx, folders.results);

const cases = [
  make("g-accept", "good", "ACCEPT"),
  make("g-defer", "good", "DEFER"),
  make("g-reject", "good", "REJECT"),
  make("d-accept", "duplicate", "ACCEPT"),
  make("d-reject", "duplicate", "REJECT"),
  make("s-accept", "stale", "ACCEPT"),
  make("e-crash", "ephemeral", "CRASH"),
  make("e-reject", "ephemeral", "REJECT"),
];

/** The manifest a run wrote into its summary.json, and the rows into its samples.jsonl. */
const stored = (dir: string) => ({
  summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
  rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
});

describe("runCorpus", () => {
  test("queues the proposals, runs the drain with its judgment tier, and counts what it accepted", async () => {
    const { ctx, folders } = setup(cases);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "promotion", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 8, n_run: 8, n_errored: 1, status: "complete", aborted_reason: null });
    expect(summary.metrics.proposals).toEqual({ n: 7, good: 3, share_good: 0.4286 });
    expect(summary.metrics.accepted).toEqual({ n: 3, good: 1 });
    expect(summary.metrics.recall).toEqual({ value: 0.3333, accepted: 1, of: 3 });
    expect(summary.metrics.precision).toEqual({ value: 0.3333, good: 1, of: 3 });
    expect(summary.metrics.by_category).toEqual({ duplicate: { n: 2, accepted: 1, rate: 0.5 }, stale: { n: 1, accepted: 1, rate: 1 }, ephemeral: { n: 1, accepted: 0, rate: 0 } });
    expect(summary.calls).toEqual({ n: 8, failures: 1, served: { "served-model": 8 } }); // read from the sandbox before it was removed
    expect(summary.model_calls).toMatchObject({ calls: 8, errors: 1 }); // and counted by removing it, before the summary took them
    expect(summary.seconds).toBeNumber();

    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    const { summary: written, rows } = stored(dir);
    expect(written.results_dir).toBeUndefined();
    expect(written.git_commit).toBeString();
    expect(rows.map((r) => r.outcome)).toEqual(["accept", "defer", "reject", "accept", "reject", "accept", "error", "reject"]);
    expect(rows[2].reason).toBe("a duplicate of a note");
  });

  test("puts all the proposals in one sandbox and one drain, which is gone when the run ends, and gives each a progress line as the rows are recorded", async () => {
    const { ctx, calls, leftover, folders } = setup(cases);
    const { out } = await loud(() => runPublic(ctx, folders));
    const log = calls();
    expect(log.map((c) => c.cmd + (c.status ? `:${c.status}` : ""))).toEqual(["index", "list:pending", "drain", "list:rejected", "list:pending"]);
    expect(new Set(log.map((c) => c.data)).size).toBe(1);
    expect(existsSync(log[0].data)).toBe(false);
    expect(leftover()).toEqual([]);
    expect(out).toContain("promotion (public): 8 of 8 cases");
    expect(out).toContain("  planted; the judge reads them one at a time");
    expect(out.filter((l) => /^ {2}\[\d\/8\]/.test(l))).toEqual([
      "  [1/8] good      accept g-accept",
      "  [2/8] good      defer  g-defer",
      "  [3/8] good      reject g-reject",
      "  [4/8] duplicate accept d-accept",
      "  [5/8] duplicate reject d-reject",
      "  [6/8] stale     accept s-accept",
      "  [7/8] ephemeral error  e-crash  LLM request failed: <MODEL_BASE_URL>/chat/completions refused",
      "  [8/8] ephemeral reject e-reject",
    ]);
  });

  test("the summary names what the run was made of: the config without secrets, the engine settings and a digest of the cases and the library", async () => {
    const { ctx, folders } = setup(cases);
    const configPatch = { path: "patch.json", sha256: "ef".repeat(32), patch: { engines: { judge: { apiKey: "sk-literal-secret" } } } }; // a patch could put a key here
    const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "promotion", configPatch } }, folders));
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
    expect(text).not.toContain("sk-literal-secret");
    const written = JSON.parse(text);
    expect(written.config.engines.judge).toMatchObject({ model: "the-model", temperature: 0, enableThinking: false, apiKey: "<redacted>" });
    expect(written.config.improve.strategies.promotion.processes.triage).toEqual({ enabled: true, applyMode: "queue", judgment: { enabled: true } });
    const settings = { model: "the-model", endpoint: endpointHost("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 };
    expect(written.engine).toEqual({ engine: "judge", ...settings, engines: { judge: settings } });
    expect(written.assets_sha256).toBe(assetsSha256(folders.cases, folders.library));
    expect(written).toMatchObject({ seed: null, status: "complete", aborted_reason: null, timeouts: 0 });
    expect(written.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
  });

  test("gives the engine the provider kind of the context, in the config akm reads and in the summary, and openai without one", async () => {
    const { ctx, seen, folders } = setup(cases.slice(0, 2));
    const summary = await quiet(() => runPublic({ ...ctx, provider: "groq" }, folders));
    expect(seen("seen.json").config.engines.judge.provider).toBe("groq");
    expect(stored(summary.results_dir).summary.config.engines.judge.provider).toBe("groq");
    const plain = setup(cases.slice(0, 2));
    const again = await quiet(() => runPublic(plain.ctx, plain.folders));
    expect(plain.seen("seen.json").config.engines.judge.provider).toBe("openai");
    expect(stored(again.results_dir).summary.config.engines.judge.provider).toBe("openai");
  });

  test("the digest of the assets is the same for the same files in another folder, and changes with a case or a library note", () => {
    const a = setup(cases);
    const b = setup(cases);
    expect(assetsSha256(a.folders.cases, a.folders.library)).toBe(assetsSha256(b.folders.cases, b.folders.library));
    writeFileSync(join(b.folders.library, "knowledge", "kept.md"), "a note that changed\n");
    expect(assetsSha256(b.folders.cases, b.folders.library)).not.toBe(assetsSha256(a.folders.cases, a.folders.library));
    const c = setup(cases.slice(0, 3));
    expect(assetsSha256(c.folders.cases, c.folders.library)).not.toBe(assetsSha256(a.folders.cases, a.folders.library));
  });

  test("two runs on identical own notes, made where private/seed holds other seeds, record no seed and compare (#70)", async () => {
    const runs: Run[] = [];
    for (const seed of ["99", "123456789012345678"]) {
      const root = tmp();
      mkdirSync(join(root, "private"));
      writeFileSync(join(root, "private", "seed"), `${seed}\n`);
      const { ctx, folders } = setup(cases);
      const summary = await quiet(() => runCorpus(customAt(dirname(folders.cases), root), ctx, folders.results));
      clearRunning(summary.results_dir);
      runs.push(loadRun(summary.results_dir));
    }
    expect(runs.map((r) => [r.summary.seed, r.summary.manifest.settings.seed])).toEqual([[null, null], [null, null]]);
    const report = comparePair(runs[0] as Run, runs[1] as Run);
    expect(report.rows.length).toBeGreaterThan(0);
    // what the fix is for: a run that recorded the seed file, as these did before, is refused against one that recorded another
    const was = (run: Run, seed: string): Run => ({ ...run, summary: { ...run.summary, seed, manifest: { ...run.summary.manifest, settings: { ...run.summary.manifest.settings, seed } } } });
    expect(comparePair(was(runs[0] as Run, "99"), was(runs[1] as Run, "123456789012345678")).changes.find((c) => c.field === "settings")).toBeDefined();
  });

  test("a proposal whose model call timed out is an errored row marked timed_out, and the summary counts the timeouts apart from the other errors", async () => {
    const { ctx, folders } = setup([make("g-ok", "good", "ACCEPT"), make("s-slow", "stale", "SLOW"), make("e-crash", "ephemeral", "CRASH"), make("d-ok", "duplicate", "REJECT")]);
    const summary = await quiet(() => runPublic(ctx, folders));
    const { rows } = stored(summary.results_dir);
    expect(rows[1]).toMatchObject({ id: "s-slow", outcome: "error", timed_out: true, error: "LLM request timed out after 600000ms" });
    expect(rows[2].outcome).toBe("error");
    expect("timed_out" in rows[2]).toBe(false);
    expect("timed_out" in rows[0]).toBe(false);
    expect(summary).toMatchObject({ n_run: 4, n_errored: 2, timeouts: 1 });
  });

  test("runs the strategy it is given, and records it with the config patch's path and SHA-256", async () => {
    const { ctx, folders } = setup(cases, { FAKE_STRATEGY: "lab-strategy" });
    const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "lab-strategy", configPatch: { path: "patches/p.json", sha256: "abc123", patch: {} } } }, folders));
    expect(summary).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
    expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
  });

  test("without the flags it runs its own strategy and records no patch", async () => {
    const { ctx, folders } = setup(cases);
    expect(await quiet(() => runPublic(ctx, folders))).toMatchObject({ strategy: "promotion", config_patch: null });
  });

  test("writes the endpoint of a failed call as <MODEL_BASE_URL>", async () => {
    const { ctx, folders } = setup(cases);
    const summary = await quiet(() => runPublic(ctx, folders));
    const row = stored(summary.results_dir).rows.find((r) => r.outcome === "error");
    expect(row.error).toBe("LLM request failed: <MODEL_BASE_URL>/chat/completions refused");
    expect(JSON.stringify(row)).not.toContain("localhost:1");
  });

  test("holds out the notes the cases write, keeps the others, and runs under the strategy with judgment on", async () => {
    const { ctx, seen, folders } = setup(cases);
    await quiet(() => runPublic(ctx, folders));
    expect(seen("seen.json").library).toEqual(["kept.md"]);
    expect(seen("seen.json").config.improve.strategies.promotion.processes.triage).toEqual({ enabled: true, applyMode: "queue", judgment: { enabled: true } });
  });

  test("indexes the bundle with embeddings and writes each case's note as the memory its promotion names", async () => {
    const { ctx, calls, seen, folders } = setup(cases);
    await quiet(() => runPublic(ctx, folders));
    expect(calls().find((c) => c.cmd === "index").hf).toContain(".cache");
    expect(seen("indexed.json").memories).toEqual(cases.map((c) => `${c.id}.md`).sort());
    expect(seen("seen.json").config).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
  });

  test("stops when akm embedded fewer assets than it indexed", async () => {
    const { ctx, folders } = setup(cases);
    const configPatch = { path: "patch.json", sha256: "12".repeat(32), patch: { semanticSearchMode: "off" } };
    await expect(quiet(() => runPublic({ ...ctx, overrides: { strategy: "promotion", configPatch } }, folders))).rejects.toThrow("embedded 0 of 9 assets");
  });

  test("a limit queues a mix of the categories", async () => {
    const { ctx, folders } = setup(cases);
    const summary = await quiet(() => runPublic({ ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 8, n_run: 4 });
    expect(stored(summary.results_dir).rows.map((r) => r.category)).toEqual(["good", "duplicate", "stale", "ephemeral"]);
  });

  test("stops with a message when no proposal got a verdict, after writing a summary that says the run was aborted", async () => {
    const { ctx, folders } = setup([make("only", "duplicate", "CRASH")]);
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("no proposal got a verdict");
    const written = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0] as string, "summary.json"), "utf8"));
    expect(written).toMatchObject({ status: "aborted", n_run: 1, n_errored: 1 });
    expect(written.aborted_reason).toBe("no proposal got a verdict. First error: LLM request failed: <MODEL_BASE_URL>/chat/completions refused");
  });

  test("gives up only when every proposal errored: one with a verdict is a result, however many did not get one", async () => {
    const many = [make("c1", "duplicate", "CRASH"), make("c2", "stale", "CRASH"), make("c3", "ephemeral", "SLOW"), make("c4", "duplicate", "CRASH"), make("c5", "stale", "CRASH"), make("c6", "ephemeral", "CRASH"), make("ok", "good", "DEFER")];
    const { ctx, folders } = setup(many);
    expect(await quiet(() => runPublic(ctx, folders))).toMatchObject({ status: "complete", aborted_reason: null, n_run: 7, n_errored: 6 }); // there is no five-in-a-row rule: the drain is one call
  });

  test("a failed akm command ends the run with its message and exit code 1, not a stack, and the endpoint hidden, and the sandbox is gone", async () => {
    const { ctx, leftover, folders } = setup(cases, { FAKE_FAIL: "rejected" });
    const { error } = await loud(() => runPublic(ctx, folders));
    expect(error).toBeInstanceOf(Fatal);
    expect((error as Fatal).code).toBe(1);
    expect((error as Fatal).message).toStartWith("akm proposal failed (exit 3): could not reach <MODEL_BASE_URL>/chat/completions");
    expect((error as Fatal).message).not.toContain("localhost:1");
    expect(leftover()).toEqual([]);
  });

  test("records how long the batch took, the drain included, as seconds", async () => {
    const { ctx, folders } = setup(cases.slice(0, 2), { FAKE_DRAIN_MS: "700" });
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary.seconds).toBeGreaterThanOrEqual(0.7);
    expect(stored(summary.results_dir).summary.seconds).toBe(summary.seconds);
  });

  test("--timeout-ms is how long the drain may run, and without it the drain gets two hours, which the summary and the manifest record", async () => {
    const plain = setup(cases.slice(0, 2));
    const summary = await quiet(() => runPublic(plain.ctx, plain.folders));
    expect([summary.timeout_ms, summary.manifest.settings.timeout_ms]).toEqual([7_200_000, 7_200_000]);
    const slow = setup(cases.slice(0, 2), { FAKE_DRAIN_MS: "5000" });
    await expect(quiet(() => runPublic({ ...slow.ctx, timeoutMs: 600 }, slow.folders))).rejects.toThrow("akm proposal drain failed (exit 137): akm timed out after 0.6s");
    expect(slow.leftover()).toEqual([]);
  });

  test("stops before it writes a row when akm's proposals table has not the columns the eval writes, and names the missing ones", async () => {
    const ddl = "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, stash TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}')";
    const { ctx, folders } = setup(cases, { FAKE_PROPOSALS_DDL: ddl });
    const message = await quiet(() => runPublic(ctx, folders)).then(() => "", (e: Error) => e.message);
    expect(message).toContain("akm's proposals table has no column stash_dir, frontmatter_json (it has id, stash, ref, status, source, created_at, updated_at, content, metadata_json)");
    expect(message).toContain("Depends on akm's private schema");
    // and plant, which the run calls, has written no row of its own
    const sandbox = createSandbox("promotion-test", { semantic: true });
    dirs.push(sandbox.dir);
    await expect(quiet(() => plant(sandbox, cases, folders.library))).rejects.toThrow("has no column stash_dir");
    const db = new Database(join(sandbox.env.AKM_DATA_DIR as string, "state.db"));
    expect(db.query("SELECT COUNT(*) AS n FROM proposals").get()).toEqual({ n: 0 });
    db.close();
  });

  test("an akm with no proposals table at all is named too", async () => {
    const { ctx, folders } = setup(cases, { FAKE_PROPOSALS_DDL: "SELECT 1" }); // creates nothing
    const message = await quiet(() => runPublic(ctx, folders)).then(() => "", (e: Error) => e.message);
    expect(message).toContain("akm's state.db has no proposals table.");
  });

  test("the run goes on without the model call counts when the events table is not what the eval reads, and says why on stderr", async () => {
    const { ctx, folders } = setup(cases, { FAKE_NO_EVENTS: "1" });
    const { result, err } = await loud(() => runPublic(ctx, folders));
    expect(result?.calls).toBeNull();
    expect(result?.metrics.accepted).toEqual({ n: 3, good: 1 }); // the verdicts do not come from the events
    expect(err).toEqual(["promotion: no model call counts in the summary: akm's state.db has no events table"]);
  });

  test("stops when akm lists fewer proposals than were queued", async () => {
    const { ctx, folders } = setup(cases, { FAKE_BUNDLE: "/nowhere" }); // the fake lists the proposals of the folder it is told
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("pending proposals");
  });

  test("the summary has every key it has always had, which the website, scripts/ledger, compare and rescore read, and timeout_ms besides, and no concurrency: it has one drain, not a pool", async () => {
    const { ctx, folders } = setup(cases.slice(0, 3));
    const summary = await quiet(() => runPublic(ctx, folders));
    const { summary: written } = stored(summary.results_dir);
    expect(Object.keys(written).sort()).toEqual([...SUMMARY_KEYS, "timeout_ms"].sort());
    expect("concurrency" in written).toBe(false);
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(written), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(written).toMatchObject({ timeout_ms: 7_200_000, timeouts: 0, n_run: 3 });
    expect(written.calls).toEqual({ n: 3, failures: 0, served: { "served-model": 3 } });
  });
});

describe("the manifest of a run", () => {
  test("is sound, carries the eval's version, and a digest of the input and the labels of every case it selected", async () => {
    const { ctx, folders } = setup(cases);
    const { summary } = stored((await quiet(() => runPublic(ctx, folders))).results_dir);
    const { manifest } = summary;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(summary).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "promotion", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, eval_settings: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: summary.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "promotion", config_patch_sha256: null, timeout_ms: 7_200_000, seed: null }); // the drain's limit, which used to be recorded as null
    expect(Object.keys(manifest.cases)).toEqual(cases.map((c) => c.id));
    const bundle = bundleSha256(folders.library, cases);
    expect(manifest.cases["g-accept"]).toEqual({
      input_sha256: sha256Json({ ref: "knowledge/g-accept", content: cases[0]?.content, bundle }),
      label_sha256: sha256Json({ label: "good", category: "good", ref: "knowledge/g-accept" }),
    });
    expect(manifest.completion).toEqual({ selected: cases.map((c) => c.id), scored: cases.filter((c) => c.id !== "e-crash").map((c) => c.id), errored: ["e-crash"] });
  });

  test("holds the config without the engine's settings and without the endpoint, and the engine settings by name", async () => {
    const { ctx, folders } = setup(cases);
    const { summary } = stored((await quiet(() => runPublic(ctx, folders))).results_dir);
    expect(JSON.stringify(summary.manifest.config.redacted)).not.toContain("localhost");
    expect(summary.manifest.engines).toEqual(summary.engine.engines);
    expect(summary.manifest.engines.judge).toEqual({ model: "the-model", endpoint: "<MODEL_BASE_URL>", temperature: 0, enableThinking: false, timeoutMs: 600_000 });
    expect(JSON.stringify(summary)).not.toContain("localhost:1/v1"); // the summary's config names the endpoint as <MODEL_BASE_URL>
    expect(summary.config.engines.judge.endpoint).toBe("<MODEL_BASE_URL>/chat/completions");
  });

  test("a case's input follows the notes of the bundle it was planted among: another library, or a run of fewer cases, is another input", async () => {
    const digests = async (more: Partial<Parameters<typeof runCorpus>[1]>, edit?: (library: string) => void) => {
      const { ctx, folders } = setup(cases);
      edit?.(folders.library);
      return stored((await quiet(() => runPublic({ ...ctx, ...more }, folders))).results_dir).summary.manifest.cases;
    };
    const base = await digests({});
    expect(await digests({})).toEqual(base);
    const changed = await digests({}, (library) => writeFileSync(join(library, "knowledge", "kept.md"), "a note that changed\n"));
    expect(changed["g-accept"].input_sha256).not.toBe(base["g-accept"].input_sha256);
    expect(changed["g-accept"].label_sha256).toBe(base["g-accept"].label_sha256);
    const limited = await digests({ limit: 4 });
    expect(Object.keys(limited)).toEqual(["g-accept", "d-accept", "s-accept", "e-crash"]);
    expect(limited["g-accept"].input_sha256).not.toBe(base["g-accept"].input_sha256); // the notes of the cases that were not run stay in the bundle
  });

  test("the digest of the bundle is that of the notes plant leaves in the sandbox", async () => {
    const { folders } = setup(cases);
    const sandbox = createSandbox("promotion-test", { semantic: true });
    dirs.push(sandbox.dir);
    const some = cases.slice(0, 3);
    await quiet(() => plant(sandbox, some, folders.library));
    const left = digestTree(join(sandbox.dir, "bundle", "knowledge"));
    expect(Object.keys(left).sort()).toEqual(["d-reject.md", "e-crash.md", "e-reject.md", "kept.md", "s-accept.md", "d-accept.md"].sort());
    expect(bundleSha256(folders.library, some)).toBe(digestOf(Object.keys(left).map((f): [string, string] => [`knowledge/${f}`, join(sandbox.dir, "bundle", "knowledge", f)])));
  });
});

describe("rescore", () => {
  /** The real public cases and library, run against the fake akm with a verdict for each of their refs, and the results folder cleared for rescore. `as` reads them as another corpus. */
  async function publicRun(as: (folder: string) => ResolvedCorpus = publicAt) {
    const real = as(join(EVAL_DIR, "assets"));
    const publicCases = parseCases(readFileSync(join(real.folder, "cases.jsonl"), "utf8"));
    const words = ["ACCEPT", "REJECT", "DEFER", "SLOW", "ACCEPT", "CRASH"];
    const { ctx, folders } = setup([make("x", "good", "ACCEPT")], { FAKE_VERDICTS: JSON.stringify(Object.fromEntries(publicCases.map((c, i) => [c.ref, words[i % words.length]]))) });
    const summary = await quiet(() => runCorpus(real, ctx, folders.results));
    clearRunning(summary.results_dir);
    return { summary, publicCases };
  }

  test("scores a run of the public cases again from the raw outputs its samples.jsonl holds, to the rows and metrics it wrote", async () => {
    const { summary } = await publicRun();
    expect(summary).toMatchObject({ n_cases: 80, n_run: 80, n_errored: 26, timeouts: 13 });
    const { out, result } = rescoreFolder(summary.results_dir);
    expect(out).toBe(`${summary.results_dir}-rescored`);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    const was = stored(summary.results_dir);
    const now = stored(out);
    expect(now.rows).toEqual(was.rows);
    expect(now.summary.metrics).toEqual(was.summary.metrics);
    expect(now.summary).toMatchObject({ n_run: 80, n_errored: 26, timeouts: 13 });
    expect(manifestProblems(now.summary.manifest)).toEqual([]);
    expect(now.summary.manifest.collector).toEqual(was.summary.manifest.collector);
    expect(now.summary.manifest.rescored_from).toMatchObject({ results: basename(summary.results_dir), dropped: [] });
  });

  test("a custom corpus whose folder is in the repository records it, and a rescore finds the cases there (corpus_folder)", async () => {
    const root = tmp();
    const { summary } = await publicRun((folder) => customAt(folder, root)); // the committed cases and library, read as a custom corpus
    const dir = summary.results_dir;
    expect(summary).toMatchObject({ corpus: "custom", corpus_folder: "evals/promotion/assets" });
    expect(stored(dir).summary.corpus_folder).toBe("evals/promotion/assets"); // from the repository root, with /, never absolute
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(stored(out).rows).toEqual(stored(dir).rows);
    expect(stored(out).summary).toMatchObject({ corpus: "custom", corpus_folder: "evals/promotion/assets", n_run: 80, n_errored: 26 });
    expect(MEASUREMENT.loadCases(REPO, stored(dir).summary).map((c) => c.id)).toEqual(parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8")).map((c) => c.id));
    expect((await publicRun()).summary.corpus_folder).toBeNull(); // the public cases record none
  });

  test("a custom corpus outside the repository records no folder, a rescore asks for it with --cases, and the cases are read from there", async () => {
    const { ctx, folders } = setup(cases);
    const dir = dirname(folders.cases);
    const summary = await quiet(() => runCorpus(customAt(dir, tmp()), ctx, folders.results));
    clearRunning(summary.results_dir);
    expect(stored(summary.results_dir).summary.corpus_folder).toBeNull();
    expect(() => rescoreFolder(summary.results_dir)).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
    const { out, result } = rescoreFolder(summary.results_dir, { cases: dir });
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(stored(out).rows).toEqual(stored(summary.results_dir).rows);
    expect(stored(out).summary.manifest.rescored_from.dropped).toEqual([]);
    expect(stored(out).summary.corpus_folder).toBeNull(); // the folder is outside the repository, so it is not written down
    // other cases in the folder are other labels: a case that was relabelled is named
    const relabelled = cases.map((c) => (c.id === "g-accept" ? { ...c, label: "bad", category: "duplicate" } : c));
    writeFileSync(join(dir, "cases.jsonl"), relabelled.map((c) => `${JSON.stringify(c)}\n`).join(""));
    const again = rescoreFolder(summary.results_dir, { cases: dir });

    expect(stored(again.out).rows[0]).toMatchObject({ id: "g-accept", label: "bad", category: "duplicate", outcome: "accept" });
  });

  test("a run whose rows lack the outcome the scorer reads is refused, with the field named", async () => {
    const { summary } = await publicRun();
    const rows = stored(summary.results_dir).rows;
    const dir = `${summary.results_dir}-thin`;
    cpSync(summary.results_dir, dir, { recursive: true });
    const { outcome: _outcome, ...first } = rows[0];
    writeFileSync(join(dir, "samples.jsonl"), [first, ...rows.slice(1)].map((r) => `${JSON.stringify(r)}\n`).join(""));
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the promotion scorer reads: outcome \(1 row: good-01\)/);
  });
});

describe("callStats", () => {
  /** A sandbox whose state.db holds the tables in `ddl`. */
  function withState(ddl: string[]) {
    setup(cases.slice(0, 1));
    const sandbox = createSandbox("promotion-test");
    dirs.push(sandbox.dir);
    const db = new Database(join(sandbox.env.AKM_DATA_DIR as string, "state.db"), { create: true });
    for (const d of ddl) db.run(d);
    db.run("INSERT INTO events VALUES (1, 'llm_usage', '{\"outcome\":\"success\",\"model\":\"m\"}')");
    db.close();
    return sandbox;
  }
  const logged = (f: () => unknown) => {
    const errors: string[] = [];
    const error = console.error;
    console.error = (...a: unknown[]) => void errors.push(a.join(" "));
    try {
      return { result: f(), errors };
    } finally {
      console.error = error;
    }
  };

  test("counts the llm_usage events of the table it expects", () => {
    const sandbox = withState(["CREATE TABLE events (id INTEGER, event_type TEXT, metadata_json TEXT)"]);
    expect(logged(() => callStats(sandbox))).toEqual({ result: { n: 1, failures: 0, served: { m: 1 } }, errors: [] });
  });

  test("is null, with the missing column named, when the events table has not the columns it reads", () => {
    const sandbox = withState(["CREATE TABLE events (id INTEGER, kind TEXT, metadata_json TEXT)"]);
    const { result, errors } = logged(() => callStats(sandbox));
    expect(result).toBeNull();
    expect(errors).toEqual(["promotion: no model call counts in the summary: akm's events table has no column event_type (it has id, kind, metadata_json)"]);
  });

  test("is null, with the reason, when state.db is not there", () => {
    setup(cases.slice(0, 1));
    const sandbox = createSandbox("promotion-test");
    const { result, errors } = logged(() => callStats(sandbox));
    removeSandbox(sandbox);
    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith("promotion: no model call counts in the summary: ");
  });
});

describe("the command", () => {
  const RUN = join(import.meta.dir, "run.ts");
  const cli = async (args: string[], env: Record<string, string>) => {
    const proc = Bun.spawn(["bun", RUN, ...args], { env: { ...process.env, MODEL_NAME: "m", MODEL_API_KEY: "", AKM_BIN: "no-such-akm-in-this-test", ...env }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { out, err, code };
  };
  const MODEL = { MODEL_BASE_URL: "http://127.0.0.1:9/v1" };

  /** A copy of the code and the public assets in a temp folder, so that the run's results are there and never in the repository. */
  function copyOfRepo(): string {
    const tree = tmp();
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL_DIR, "src"), join(tree, "evals", "promotion", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL_DIR, "assets"), join(tree, "evals", "promotion", "assets"), { recursive: true });
    return tree;
  }

  test("runs the public cases in one sandbox and one drain, with two hours for the drain; --timeout-ms changes that and the summary records it", () => {
    const tree = copyOfRepo();
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const run = (label: string, flags: string[]) => {
      const [log, own] = [join(tree, `${label}.calls.jsonl`), join(tree, `${label}.tmp`)];
      mkdirSync(own);
      const env = { ...process.env, ...MODEL, MODEL_NAME: "m", MODEL_API_KEY: "", AKM_EVAL_NO_PROBE: "1", AKM_BIN: commandLine(["bun", script]), FAKE_LOG: log, TMPDIR: own }; // nothing listens on port 9, and the run is not to ask it
      const done = Bun.spawnSync(["bun", join(tree, "evals", "promotion", "src", "run.ts"), "--corpus", "public", "--limit", "4", "--label", label, ...flags], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
      const results = join(tree, "evals", "promotion", "results");
      const folder = join(results, readdirSync(results).find((name) => name.endsWith(`-${label}`)) as string);
      return { code: done.exitCode, err: done.stderr.toString(), calls: readCalls(log), leftover: readdirSync(own), ...stored(folder) };
    };
    const plain = run("defaults", []);
    const set = run("flags", ["--timeout-ms", "20000"]);
    for (const r of [plain, set]) {
      expect([r.code, r.err]).toEqual([0, ""]);
      expect(r.calls.filter((c) => c.cmd === "version")).toHaveLength(1); // akm is probed once
      expect(r.calls.filter((c) => c.cmd === "drain")).toHaveLength(1);
      expect(new Set(r.calls.filter((c) => c.cmd !== "version").map((c) => c.data)).size).toBe(1);
      expect(r.leftover).toEqual([]);
      expect(r.rows).toHaveLength(4);
      expect(r.summary).toMatchObject({ n_run: 4, status: "complete" });
      expect(Object.keys(r.summary).sort()).toEqual([...SUMMARY_KEYS, "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    }
    expect([plain.summary.timeout_ms, plain.summary.manifest.settings.timeout_ms]).toEqual([7_200_000, 7_200_000]);
    expect([set.summary.timeout_ms, set.summary.manifest.settings.timeout_ms]).toEqual([20_000, 20_000]);
  }, 60_000);

  test("the results of a corpus go where the README says: the eval's results/ for the public cases, private/promotion/results/ for a custom corpus", () => {
    const root = tmp();
    expect(defaultResults(publicAt("/some/cases"))).toBe(join(EVAL_DIR, "results"));
    expect(defaultResults(customAt("/some/notes", root))).toBe(join(REPO, "private", "promotion", "results"));
  });

  test("--corpus custom and --corpus all need --cases: promotion has no rewrite, and says so before anything runs", async () => {
    for (const corpus of ["custom", "all"]) {
      const done = await cli(["--corpus", corpus], MODEL);
      expect(done.code, corpus).toBe(2);
      expect(done.err, corpus).toContain("promotion has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR");
    }
  });

  test("a folder of your own that has cases.jsonl and no library/knowledge/ is named before akm is asked for anything", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "cases.jsonl"), `${JSON.stringify(cases[0])}\n`);
    const done = await cli(["--cases", dir], MODEL);
    expect(done.code).toBe(2);
    expect(done.err).toContain(`promotion: ${dir}/library/knowledge/ does not exist. The folder of a custom corpus holds library/knowledge/ as well as cases.jsonl: see "Run your own set" in evals/promotion/README.md.`);
    expect(done.err).not.toContain("could not run"); // akm was never asked for
  });

  test("the usage names what promotion adds to the flags every eval has: no rewrite, no --concurrency, a drain limit, no akm floor", async () => {
    const { out, code } = await cli(["--help"], MODEL);
    expect(code).toBe(0);
    expect(out).toStartWith("Usage: evals/promotion/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND] [--timeout-ms N]\n");
    expect(out).toContain("promotion has no rewrite: its custom corpus is --cases DIR only. The folder holds cases.jsonl and library/");
    expect(out).toContain("  --limit   run N proposals, one of each category in turn\n");
    expect(out).toContain("--strategy      the akm improve strategy to run in place of promotion");
    expect(out).toContain("  --timeout-ms   how long the drain may run; the other akm commands keep their own limits. Default: 7200000.\n");
    expect(out).not.toContain("--concurrency");
    expect(out).not.toMatch(/--yes|-y\b/);
    expect(out).toEndWith(`\n\nNeeds akm on PATH, or in AKM_BIN.\n${PROBE_NOTE}\n`);
    const refused = await cli(["--concurrency", "2"], MODEL);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("Unknown option '--concurrency'");
  });
});
