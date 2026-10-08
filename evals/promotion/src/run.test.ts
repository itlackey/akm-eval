import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, writeConfig } from "../../../lib/akm/akm.ts";
import { type Case, promotionConfig } from "./lib.ts";
import { callStats, foldersFor, runCorpus } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

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
  db.run("CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, stash_dir TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', frontmatter_json TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
  db.run("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, ts TEXT NOT NULL, ref TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')");
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
const pending = () => db.query("SELECT id, content FROM proposals WHERE status = 'pending' AND stash_dir = ?").all(process.env.AKM_BUNDLE_DIR);
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "pending") { out({ totalCount: pending().length, proposals: [] }); process.exit(0); }
if (args[0] === "proposal" && args[1] === "list" && args[args.indexOf("--status") + 1] === "rejected") {
  out({ proposals: JSON.parse(readFileSync(join(data, "rejected.json"), "utf8")) });
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "drain") {
  if (!has("--judgment") || args[args.indexOf("--strategy") + 1] !== "promotion" || has("--promote")) { console.error("unexpected " + args.join(" ")); process.exit(2); }
  const bundle = process.env.AKM_BUNDLE_DIR;
  writeFileSync(join(data, "seen.json"), JSON.stringify({ config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")), library: existsSync(join(bundle, "knowledge")) ? readdirSync(join(bundle, "knowledge")).sort() : [] }));
  const result = { ok: true, staged: [], rejected: [], deferred: [], failed: [] };
  const rejected = [];
  for (const p of pending()) {
    const word = p.content.split("\\n\\n").pop().split(/\\s/)[0];
    const usage = (outcome) => db.run("INSERT INTO events (event_type, ts, metadata_json) VALUES ('llm_usage', ?, ?)", [new Date().toISOString(), JSON.stringify({ outcome, model: "served-model" })]);
    if (word === "ACCEPT") { result.staged.push(p.id); usage("success"); }
    else if (word === "REJECT") { result.rejected.push(p.id); rejected.push({ id: p.id, review: { reason: "a duplicate of a note" } }); usage("success"); }
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
    const summary = await quiet(() => runCorpus("public", ctx, folders));
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

  test("writes the endpoint of a failed call as <MODEL_BASE_URL>", async () => {
    const { ctx, folders } = setup(cases);
    await quiet(() => runCorpus("public", ctx, folders));
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const row = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.outcome === "error");
    expect(row.error).toBe("LLM request failed: <MODEL_BASE_URL>/chat/completions refused");
    expect(JSON.stringify(row)).not.toContain("localhost:1");
  });

  test("holds out the notes the cases write, keeps the others, and runs under the strategy with judgment on", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    await quiet(() => runCorpus("public", ctx, folders));
    const seen = JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "seen.json"), "utf8"));
    expect(seen.library).toEqual(["kept.md"]);
    expect(seen.config.improve.strategies.promotion.processes.triage).toEqual({ enabled: true, applyMode: "queue", judgment: { enabled: true } });
  });

  test("indexes the bundle with embeddings and writes each case's note as the memory its promotion names", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    await quiet(() => runCorpus("public", ctx, folders));
    expect(sandbox.env.HF_HOME).toContain(".cache");
    expect(JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "indexed.json"), "utf8")).memories).toEqual(cases.map((c) => `${c.id}.md`).sort());
    const seen = JSON.parse(readFileSync(join(sandbox.env.AKM_DATA_DIR, "seen.json"), "utf8"));
    expect(seen.config).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
  });

  test("stops when akm embedded fewer assets than it indexed", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    writeConfig(sandbox, { ...promotionConfig("http://localhost:1/v1", "the-model", false), semanticSearchMode: "off" });
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("embedded 0 of 9 assets");
  });

  test("a limit queues a mix of the categories", async () => {
    const { ctx, folders } = setup(cases);
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 8, n_run: 4 });
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.category)).toEqual(["good", "duplicate", "stale", "ephemeral"]);
  });

  test("stops with a message when no proposal got a verdict", async () => {
    const { ctx, folders } = setup([make("only", "duplicate", "CRASH")]);
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("no proposal got a verdict");
  });

  test("stops when akm lists fewer proposals than were queued", async () => {
    const { ctx, sandbox, folders } = setup(cases);
    sandbox.env.AKM_BUNDLE_DIR = join(sandbox.dir, "elsewhere"); // the fake lists the proposals of the folder it is told
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("pending proposals");
  });
});

describe("--cases", () => {
  const RUN = join(import.meta.dir, "run.ts");
  const cli = async (args: string[], env: Record<string, string>) => {
    const proc = Bun.spawn(["bun", RUN, ...args], { env: { ...process.env, MODEL_NAME: "m", MODEL_API_KEY: "", ...env }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { out, err, code };
  };

  test("reads the own corpus from the folder it names, and writes results where own results go", () => {
    const own = foldersFor("own");
    const elsewhere = foldersFor("own", "/some/notes");
    expect(elsewhere).toEqual({ cases: "/some/notes/cases.jsonl", library: "/some/notes/library", results: own.results });
    expect(own.cases).toEndWith("private/promotion/own/cases.jsonl");
  });

  test("a folder of notes is refused before it is read when the model is not on this machine or the network", async () => {
    const { folders } = setup(cases);
    const dir = join(folders.cases, "..");
    const refused = await cli(["--cases", dir], { MODEL_BASE_URL: "http://8.8.8.8/v1" });
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("--cases sends your notes to the model, so MODEL_BASE_URL must be localhost");
  });

  test("is an own corpus, so it cannot be combined with another corpus, and a folder without a set is named", async () => {
    const { folders } = setup(cases);
    const dir = join(folders.cases, "..");
    expect((await cli(["--cases", dir, "--corpus", "public"], { MODEL_BASE_URL: "http://127.0.0.1:9/v1" })).err).toContain("--cases is an own corpus");
    const empty = mkdtempSync(join(tmpdir(), "promotion-empty-"));
    dirs.push(empty);
    const missing = await cli(["--cases", empty], { MODEL_BASE_URL: "http://127.0.0.1:9/v1" });
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("the own set is missing");
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
