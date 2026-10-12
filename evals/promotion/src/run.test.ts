import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { createSandbox, writeConfig } from "../../../lib/akm/akm.ts";
import { digestTree } from "../../../lib/akm/index-cache.ts";
import { ALIASES, type ResolvedCorpus, resolveCorpora } from "../../../lib/corpus.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointRecord, harnessSha256, sha256Json, sha256Text, withoutEngineSettings } from "../../../lib/provenance.ts";
import { clearRunning } from "../../../lib/results.ts";
import { type Run, comparePair, loadRun } from "../../../scripts/compare/src/lib.ts";
import { rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { type Case, assetsSha256, bundleSha256, callStats, digestOf, parseCases, plant, promotionConfig } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { resultsOf, runCorpus } from "./run.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const REPO = resolve(EVAL_DIR, "..", "..");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temporary folder, removed after the test. */
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "promotion-root-"));
  dirs.push(d);
  return d;
};

/**
 * An akm with akm's proposals table. Its drain reads the first word of each pending proposal's body as the verdict: ACCEPT,
 * REJECT, DEFER, or CRASH, which fails the model call and leaves the proposal undecided. It writes what it saw to seen.json.
 */
const FAKE_AKM = `
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const has = (w) => args.includes(w);
const data = process.env.AKM_DATA_DIR;
const dbPath = join(data, "state.db");
const out = (x) => console.log(JSON.stringify(x));
if (args[0] === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (args[0] === "index") {
  const db = new Database(dbPath);
  // FAKE_PROPOSALS_DDL lays the table out another way, and FAKE_NO_EVENTS leaves the events table out, like an akm build with another schema.
  db.run(process.env.FAKE_PROPOSALS_DDL ?? "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, stash_dir TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', frontmatter_json TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
  if (!process.env.FAKE_NO_EVENTS) db.run("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, ts TEXT NOT NULL, ref TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
  // Like akm's index: how many assets it found, and how many it embedded. The embedder is off unless the config turns it on.
  const count = (d) => existsSync(d) ? readdirSync(d, { recursive: true }).filter((f) => String(f).endsWith(".md")).length : 0;
  const total = count(join(process.env.AKM_BUNDLE_DIR, "knowledge")) + count(join(process.env.AKM_BUNDLE_DIR, "memories"));
  const config = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  const embedded = config.semanticSearchMode === "auto" && config.embedding?.localModel ? total : 0;
  writeFileSync(join(data, "indexed.json"), JSON.stringify({ memories: existsSync(join(process.env.AKM_BUNDLE_DIR, "memories")) ? readdirSync(join(process.env.AKM_BUNDLE_DIR, "memories")).sort() : [] }));
  out({ ok: true, totalEntries: total, verification: { embeddingCount: embedded, message: "embedded" } });
  process.exit(0);
}
const db = new Database(dbPath);
const pending = () => db.query("SELECT id, ref, content FROM proposals WHERE status = 'pending' AND stash_dir = ?").all(process.env.AKM_BUNDLE_DIR);
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "pending") { out({ totalCount: pending().length, proposals: [] }); process.exit(0); }
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "rejected") {
  out({ proposals: JSON.parse(readFileSync(join(data, "rejected.json"), "utf8")) });
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "drain") {
  if (!has("--judgment") || args[args.indexOf("--strategy") + 1] !== (process.env.FAKE_STRATEGY ?? "promotion") || has("--promote")) { console.error("unexpected " + args.join(" ")); process.exit(2); }
  const bundle = process.env.AKM_BUNDLE_DIR;
  writeFileSync(join(data, "seen.json"), JSON.stringify({ config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")), library: existsSync(join(bundle, "knowledge")) ? readdirSync(join(bundle, "knowledge")).sort() : [] }));
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

function setup(cases: Case[]) {
  const root = mkdtempSync(join(tmpdir(), "promotion-run-"));
  dirs.push(root);
  mkdirSync(join(root, "library", "knowledge"), { recursive: true });
  for (const f of ["kept", ...cases.map((c) => c.id)]) writeFileSync(join(root, "library", "knowledge", `${f}.md`), `note ${f}\n`);
  writeFileSync(join(root, "cases.jsonl"), cases.map((c) => `${JSON.stringify(c)}\n`).join(""));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const sandbox = { ...createSandbox("promotion-test", { semantic: true }), cmd: ["bun", script] };
  dirs.push(sandbox.dir);
  writeConfig(sandbox, promotionConfig("http://localhost:1/v1", "the-model", false));
  const ctx = { sandbox, version: "0.9.99-test", model: "the-model", baseUrl: "http://localhost:1/v1", label: "t" };
  return { ctx, sandbox, folders: { cases: join(root, "cases.jsonl"), library: join(root, "library"), results: join(root, "results") } };
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
const publicAt = (root: string): ResolvedCorpus => ({ name: "public", folder: root, config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" });

/** The custom corpus that `--cases DIR` names, resolved the way the command does it, in a repository root of its own. */
const customAt = (dir: string, root: string): ResolvedCorpus => resolveCorpora({ eval: "promotion", values: { cases: dir }, publicFolder: join(root, "assets"), default: "own", aliases: { own: ALIASES.own }, root })[0] as ResolvedCorpus;

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

describe("runCorpus", () => {
  test("queues the proposals, runs the drain with its judgment tier, and counts what it accepted", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "promotion", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 8, n_run: 8, n_errored: 1 });
    expect(summary.metrics.proposals).toEqual({ n: 7, good: 3, share_good: 0.4286 });
    expect(summary.metrics.accepted).toEqual({ n: 3, good: 1 });
    expect(summary.metrics.recall).toEqual({ value: 0.3333, accepted: 1, of: 3 });
    expect(summary.metrics.precision).toEqual({ value: 0.3333, good: 1, of: 3 });
    expect(summary.metrics.by_category).toEqual({ duplicate: { n: 2, accepted: 1, rate: 0.5 }, stale: { n: 1, accepted: 1, rate: 1 }, ephemeral: { n: 1, accepted: 0, rate: 0 } });
    expect(summary.calls).toEqual({ n: 8, failures: 1, served: { "served-model": 8 } });
    expect(callStats(sandbox)?.n).toBe(8);

    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.outcome)).toEqual(["accept", "defer", "reject", "accept", "reject", "accept", "error", "reject"]);
    expect(rows[2].reason).toBe("a duplicate of a note");
  });

  test("the summary names what the run was made of: the config without secrets, the engine settings and a digest of the cases and the library", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    const config = promotionConfig("http://localhost:1/v1", "the-model", true);
    config.engines.judge.apiKey = "sk-literal-secret"; // a patch could put a key here
    writeConfig(sandbox, config);
    const summary = await quiet(() => runPublic(ctx, folders));
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
    expect(text).not.toContain("sk-literal-secret");
    const stored = JSON.parse(text);
    expect(stored.config.engines.judge).toMatchObject({ model: "the-model", temperature: 0, enableThinking: false, apiKey: "<redacted>" });
    expect(stored.config.improve.strategies.promotion.processes.triage).toEqual({ enabled: true, applyMode: "queue", judgment: { enabled: true } });
    expect(stored.engine).toEqual({ engine: "judge", model: "the-model", ...endpointRecord("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { judge: { model: "the-model", ...endpointRecord("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
    expect(stored.assets_sha256).toBe(assetsSha256(folders.cases, folders.library));
    expect(stored).toMatchObject({ seed: null, status: "complete", aborted_reason: null, timeouts: 0 });
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this eval's code and lib/
    expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir));
    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
  });

  test("the digest of the assets is the same for the same files in another folder, and changes with a case or a library note", async () => {
    const a = setup(cases);
    const b = setup(cases);
    expect(assetsSha256(a.folders.cases, a.folders.library)).toBe(assetsSha256(b.folders.cases, b.folders.library));
    writeFileSync(join(b.folders.library, "knowledge", "kept.md"), "a note that changed\n");
    expect(assetsSha256(b.folders.cases, b.folders.library)).not.toBe(assetsSha256(a.folders.cases, a.folders.library));
    const c = setup(cases.slice(0, 3));
    expect(assetsSha256(c.folders.cases, c.folders.library)).not.toBe(assetsSha256(a.folders.cases, a.folders.library));
  });

  test("a custom corpus of your own notes is private, records no seed and where the folder is, and the public cases record none either", async () => {
    const [pub, own] = [setup(cases.slice(0, 2)), setup(cases.slice(0, 2))]; // a sandbox for each run: the planted proposals have fixed ids
    const summary = await quiet(() => runPublic(pub.ctx, pub.folders));
    expect(summary).toMatchObject({ corpus: "public", corpus_kind: "public", corpus_private: false, corpus_folder: null, seed: null });
    const root = mkdtempSync(join(tmpdir(), "promotion-root-"));
    dirs.push(root);
    const dir = dirname(own.folders.cases);
    const custom = await quiet(() => runCorpus(customAt(dir, root), own.ctx, own.folders.results));
    expect(custom).toMatchObject({ corpus: "custom", corpus_kind: "own", corpus_private: true, seed: null });
    expect(custom.corpus_folder).toBe(relative(REPO, dir).startsWith("..") ? null : relative(REPO, dir)); // the folder, from the repository root, when it is inside it
    expect(custom.manifest).toMatchObject({ corpus: "custom", settings: { seed: null } });
    expect(readFileSync(join(custom.results_dir, "summary.json"), "utf8")).not.toContain(dir); // the file does not name the folder
  });

  test("two runs on identical own notes, made where private/seed holds other seeds, record no seed and compare (#70)", async () => {
    const runs: Run[] = [];
    for (const seed of ["99", "123456789012345678"]) {
      const root = mkdtempSync(join(tmpdir(), "promotion-root-"));
      dirs.push(root);
      mkdirSync(join(root, "private"));
      writeFileSync(join(root, "private", "seed"), `${seed}\n`);
      const { ctx, folders } = setup(cases);
      const summary = await quiet(() => runCorpus(customAt(dirname(folders.cases), root), ctx, folders.results));
      clearRunning(summary.results_dir);
      runs.push(loadRun(summary.results_dir));
    }
    expect(runs.map((r) => [r.summary.seed, r.summary.manifest.settings.seed])).toEqual([[null, null], [null, null]]);
    const report = comparePair(runs[0] as Run, runs[1] as Run);
    expect(report.exploratory).toEqual([]);
    expect(report.views.length).toBeGreaterThan(0);
    // what the fix is for: a run that recorded the seed file, as these did before, is refused against one that recorded another
    const was = (run: Run, seed: string): Run => ({ ...run, summary: { ...run.summary, seed, manifest: { ...run.summary.manifest, settings: { ...run.summary.manifest.settings, seed } } } });
    expect(() => comparePair(was(runs[0] as Run, "99"), was(runs[1] as Run, "123456789012345678"))).toThrow("the seed of the private assets differs");
  });

  test("a rewrite corpus records the seed its corpus.json holds", async () => {
    const { ctx, folders } = setup(cases.slice(0, 2));
    const dir = dirname(folders.cases);
    const root = mkdtempSync(join(tmpdir(), "promotion-root-"));
    dirs.push(root);
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "generated.json"), JSON.stringify({ seed: "42" }));
    writeFileSync(join(dir, "corpus.json"), JSON.stringify({ kind: "rewrite", private: false, seed: "42", generated: "assets/generated.json" }));
    const summary = await quiet(() => runCorpus(customAt(dir, root), ctx, folders.results));
    expect(summary).toMatchObject({ corpus: "custom", corpus_kind: "rewrite", corpus_private: false, seed: "42" });
    expect(summary.manifest.settings.seed).toBe("42");
  });

  test("a proposal whose model call timed out is an errored row marked timed_out, and the summary counts the timeouts apart from the other errors", async () => {
    const { ctx, folders } = setup([make("g-ok", "good", "ACCEPT"), make("s-slow", "stale", "SLOW"), make("e-crash", "ephemeral", "CRASH"), make("d-ok", "duplicate", "REJECT")]);
    const summary = await quiet(() => runPublic(ctx, folders));
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[1]).toMatchObject({ id: "s-slow", outcome: "error", timed_out: true, error: "LLM request timed out after 600000ms" });
    expect(rows[2].outcome).toBe("error");
    expect("timed_out" in rows[2]).toBe(false);
    expect("timed_out" in rows[0]).toBe(false);
    expect(summary).toMatchObject({ n_run: 4, n_errored: 2, timeouts: 1 });
  });

  test("runs the strategy it is given, and records it with the config patch's path and SHA-256", async () => {
    process.env.FAKE_STRATEGY = "lab-strategy";
    try {
      const { ctx, folders } = setup(cases);
      const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "lab-strategy", configPatch: { path: "patches/p.json", sha256: "abc123", patch: {} } } }, folders));
      expect(summary).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
      expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
    } finally {
      delete process.env.FAKE_STRATEGY;
    }
  });

  test("without the flags it runs its own strategy and records no patch", async () => {
    const { ctx, folders } = setup(cases);
    expect(await quiet(() => runPublic(ctx, folders))).toMatchObject({ strategy: "promotion", config_patch: null });
  });

  test("writes the endpoint of a failed call as <MODEL_BASE_URL>", async () => {
    const { ctx, folders } = setup(cases);
    await quiet(() => runPublic(ctx, folders));
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const row = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.outcome === "error");
    expect(row.error).toBe("LLM request failed: <MODEL_BASE_URL>/chat/completions refused");
    expect(JSON.stringify(row)).not.toContain("localhost:1");
  });

  test("holds out the notes the cases write, keeps the others, and runs under the strategy with judgment on", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    await quiet(() => runPublic(ctx, folders));
    const seen = JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "seen.json"), "utf8"));
    expect(seen.library).toEqual(["kept.md"]);
    expect(seen.config.improve.strategies.promotion.processes.triage).toEqual({ enabled: true, applyMode: "queue", judgment: { enabled: true } });
  });

  test("indexes the bundle with embeddings and writes each case's note as the memory its promotion names", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    await quiet(() => runPublic(ctx, folders));
    expect(sandbox.env.HF_HOME).toContain(".cache");
    expect(JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "indexed.json"), "utf8")).memories).toEqual(cases.map((c) => `${c.id}.md`).sort());
    const seen = JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "seen.json"), "utf8"));
    expect(seen.config).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
  });

  test("stops when akm embedded fewer assets than it indexed", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    writeConfig(sandbox, { ...promotionConfig("http://localhost:1/v1", "the-model", false), semanticSearchMode: "off" });
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("embedded 0 of 9 assets");
  });

  test("a limit queues a mix of the categories", async () => {
    const { ctx, folders } = setup(cases);
    const summary = await quiet(() => runPublic({ ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 8, n_run: 4 });
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.category)).toEqual(["good", "duplicate", "stale", "ephemeral"]);
  });

  test("stops with a message when no proposal got a verdict, after writing a summary that says the run was aborted", async () => {
    const { ctx, folders } = setup([make("only", "duplicate", "CRASH")]);
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("no proposal got a verdict");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(stored).toMatchObject({ status: "aborted", n_run: 1, n_errored: 1 });
    expect(stored.aborted_reason).toBe("no proposal got a verdict. First error: LLM request failed: <MODEL_BASE_URL>/chat/completions refused");
  });

  test("stops before it writes a row when akm's proposals table has not the columns the eval writes, and names the missing ones", async () => {
    process.env.FAKE_PROPOSALS_DDL = "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, stash TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}')";
    try {
      const { ctx, sandbox, folders } = setup(cases);
      const message = await quiet(() => runPublic(ctx, folders)).then(() => "", (e: Error) => e.message);
      expect(message).toContain("akm's proposals table has no column stash_dir, frontmatter_json (it has id, stash, ref, status, source, created_at, updated_at, content, metadata_json)");
      expect(message).toContain("Depends on akm's private schema");
      expect(new Database(join(sandbox.env.AKM_DATA_DIR, "state.db")).query("SELECT COUNT(*) AS n FROM proposals").get()).toEqual({ n: 0 });
    } finally {
      delete process.env.FAKE_PROPOSALS_DDL;
    }
  });

  test("an akm with no proposals table at all is named too", async () => {
    process.env.FAKE_PROPOSALS_DDL = "SELECT 1"; // creates nothing
    try {
      const { ctx, folders } = setup(cases);
      const message = await quiet(() => runPublic(ctx, folders)).then(() => "", (e: Error) => e.message);
      expect(message).toContain("akm's state.db has no proposals table.");
    } finally {
      delete process.env.FAKE_PROPOSALS_DDL;
    }
  });

  test("the run goes on without the model call counts when the events table is not what the eval reads, and says why on stderr", async () => {
    process.env.FAKE_NO_EVENTS = "1";
    const errors: string[] = [];
    const error = console.error;
    console.error = (...a: unknown[]) => void errors.push(a.join(" "));
    try {
      const { ctx, folders } = setup(cases);
      const summary = await quiet(() => runPublic(ctx, folders));
      expect(summary.calls).toBeNull();
      expect(summary.metrics.accepted).toEqual({ n: 3, good: 1 }); // the verdicts do not come from the events
    } finally {
      console.error = error;
      delete process.env.FAKE_NO_EVENTS;
    }
    expect(errors).toEqual(["promotion: no model call counts in the summary: akm's state.db has no events table"]);
  });

  test("stops when akm lists fewer proposals than were queued", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    sandbox.env.AKM_BUNDLE_DIR = join(sandbox.dir, "elsewhere"); // the fake lists the proposals of the folder it is told
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("pending proposals");
  });
});

/** The manifest a run wrote into its summary.json, and the rows into its samples.jsonl. */
const stored = (dir: string) => ({
  summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
  rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
});

describe("the manifest of a run", () => {
  test("is sound, carries the eval's version, and a digest of the input and the labels of every case it selected", async () => {
    const { ctx, folders } = setup(cases);
    const { summary } = stored((await quiet(() => runPublic(ctx, folders))).results_dir);
    const { manifest } = summary;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(summary).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "promotion", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: summary.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "promotion", config_patch_sha256: null, timeout_ms: null, seed: null });
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
    expect(summary.manifest.config.sha256).toBe(sha256Json(withoutEngineSettings(summary.config)));
    expect(JSON.stringify(summary.manifest.config.redacted)).not.toContain("localhost");
    expect(summary.manifest.engines).toEqual(summary.engine.engines);
    expect(summary.manifest.engines.judge).toEqual({ model: "the-model", endpoint: "http://localhost:1", endpoint_id: sha256Text("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 });
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
    const { sandbox, folders } = setup(cases);
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
    process.env.FAKE_VERDICTS = JSON.stringify(Object.fromEntries(publicCases.map((c, i) => [c.ref, words[i % words.length]])));
    try {
      const { ctx, folders } = setup([make("x", "good", "ACCEPT")]);
      const summary = await quiet(() => runCorpus(real, ctx, folders.results));
      clearRunning(summary.results_dir);
      return { summary, publicCases };
    } finally {
      delete process.env.FAKE_VERDICTS;
    }
  }

  test("scores a run of the public cases again from the raw outputs its samples.jsonl holds, to the rows and metrics it wrote", async () => {
    const { summary } = await publicRun();
    expect(summary).toMatchObject({ n_cases: 20, n_run: 20, n_errored: 6, timeouts: 3 });
    const { out, result } = rescoreFolder(summary.results_dir);
    expect(out).toBe(`${summary.results_dir}-rescored`);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const was = stored(summary.results_dir);
    const now = stored(out);
    expect(now.rows).toEqual(was.rows);
    expect(now.summary.metrics).toEqual(was.summary.metrics);
    expect(now.summary).toMatchObject({ n_run: 20, n_errored: 6, timeouts: 3 });
    expect(manifestProblems(now.summary.manifest)).toEqual([]);
    expect(now.summary.manifest.collector).toEqual(was.summary.manifest.collector);
    expect(now.summary.manifest.rescored_from).toMatchObject({ results: basename(summary.results_dir), dropped: [] });
  });

  test("a custom corpus whose folder is in the repository records it, and a rescore finds the cases there (corpus_folder)", async () => {
    const root = tmp();
    const { summary } = await publicRun((folder) => customAt(folder, root)); // the committed cases and library, read as a custom corpus
    const dir = summary.results_dir;
    expect(summary).toMatchObject({ corpus: "custom", corpus_kind: "own", corpus_private: true, corpus_folder: "evals/promotion/assets" });
    expect(stored(dir).summary.corpus_folder).toBe("evals/promotion/assets"); // from the repository root, with /, never absolute
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    expect(stored(out).rows).toEqual(stored(dir).rows);
    expect(stored(out).summary).toMatchObject({ corpus: "custom", corpus_folder: "evals/promotion/assets", n_run: 20, n_errored: 6 });
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
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(stored(out).rows).toEqual(stored(summary.results_dir).rows);
    expect(stored(out).summary.manifest.rescored_from.dropped).toEqual([]);
    expect(stored(out).summary.corpus_folder).toBeNull(); // the folder is outside the repository, so it is not written down
    // other cases in the folder are other labels: a case that was relabelled is named
    const relabelled = cases.map((c) => (c.id === "g-accept" ? { ...c, label: "bad", category: "duplicate" } : c));
    writeFileSync(join(dir, "cases.jsonl"), relabelled.map((c) => `${JSON.stringify(c)}\n`).join(""));
    const again = rescoreFolder(summary.results_dir, { cases: dir });
    expect(again.result.relabelled).toEqual(["g-accept"]);
    expect(stored(again.out).rows[0]).toMatchObject({ id: "g-accept", label: "bad", category: "duplicate", outcome: "accept" });
  });

  test("a run from before the manifest scores again too, when it read the cases that are here now, and is refused when it did not", async () => {
    const { summary } = await publicRun();
    let n = 0;
    const legacy = (change: (s: Record<string, any>) => void): string => {
      const dir = `${summary.results_dir}-legacy-${++n}`;
      cpSync(summary.results_dir, dir, { recursive: true });
      const s = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      delete s.manifest;
      change(s);
      writeFileSync(join(dir, "summary.json"), JSON.stringify(s));
      return dir;
    };
    const { result } = rescoreFolder(legacy(() => {}));
    expect(result).toMatchObject({ legacy: true, changed: [] });
    expect(() => rescoreFolder(legacy((s) => (s.assets_sha256 = "0".repeat(64))))).toThrow(/was made before the manifest, and cannot be scored again: it read other cases than the ones in evals\/promotion\/assets now/);
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
    const { sandbox } = setup(cases.slice(0, 1));
    const db = new Database(join(sandbox.env.AKM_DATA_DIR, "state.db"), { create: true });
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
    const { sandbox } = setup(cases.slice(0, 1));
    const { result, errors } = logged(() => callStats(sandbox));
    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith("promotion: no model call counts in the summary: ");
  });
});

describe("the corpus on the command line", () => {
  const RUN = join(import.meta.dir, "run.ts");
  const cli = async (args: string[], env: Record<string, string>) => {
    const proc = Bun.spawn(["bun", RUN, ...args], { env: { ...process.env, MODEL_NAME: "m", MODEL_API_KEY: "", ...env }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { out, err, code };
  };
  const ENV = { MODEL_BASE_URL: "http://127.0.0.1:9/v1" };

  test("the results of a corpus go where the README says: the eval's results/ for the public cases, private/promotion/results/ for a custom corpus", () => {
    const root = mkdtempSync(join(tmpdir(), "promotion-root-"));
    dirs.push(root);
    expect(resultsOf(publicAt("/some/cases"))).toBe(join(EVAL_DIR, "results"));
    expect(resultsOf(customAt("/some/notes", root))).toBe(join(REPO, "private", "promotion", "results"));
  });

  test("a folder of notes is refused before it is read when the model is not marked private in models.json", async () => {
    const { folders } = setup(cases);
    const dir = dirname(folders.cases);
    const refused = await cli(["--cases", dir], ENV);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(`--cases ${dir} sends your notes to m, which is not marked "private": true in models.json. The corpus is private: it has no corpus.json, and an own corpus without one is private.`);
  });

  test("--cases is a custom corpus, so it cannot be combined with the public one, and a folder without a set is named", async () => {
    const { folders } = setup(cases);
    const dir = dirname(folders.cases);
    expect((await cli(["--cases", dir, "--corpus", "public"], ENV)).err).toContain("--cases is a custom corpus: use it alone, or with --corpus custom");
    const empty = mkdtempSync(join(tmpdir(), "promotion-empty-"));
    dirs.push(empty);
    const missing = await cli(["--cases", empty], ENV);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("the custom set is missing");
  });

  test("--corpus own still works for one release, with the line that names the new form, and --corpus private is not a corpus of this eval", async () => {
    const own = await cli(["--corpus", "own"], ENV);
    expect(own.err).toContain("promotion: --corpus own is now --corpus custom. The old value works for one more release.");
    expect((await cli(["--corpus", "private"], ENV)).err).toContain('--corpus must be public, custom or all, not "private"');
  });

  test("the help lists the corpora public, custom and all, and the flag --cases", async () => {
    const help = (await cli(["--help"], ENV)).out;
    expect(help).toContain("[--corpus public|custom|all] [--cases DIR]");
  });
});

describe("--repeat", () => {
  test("must be a positive integer", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "run.ts"), "--repeat", "0"], { env: { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m" }, stdout: "pipe", stderr: "pipe" });
    const err = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(2);
    expect(err).toContain("--repeat must be a positive integer");
  });
});
