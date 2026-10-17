import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { loadConfigPatch } from "../../../lib/akm/overrides.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointHost, sha256Json, sha256Text, withoutEngineSettings } from "../../../lib/provenance.ts";
import { libraryFileOf } from "./build.ts";
import { type Case, type Raw, assetsSha256, atLeast, inject, parseCases, reflectConfig, refOf } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { MIN_AKM, corpusFolder, defaultResults, runCorpus } from "./run.ts";

const REPO = join(import.meta.dir, "..", "..", "..");
const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_PLAN: process.env.FAKE_PLAN, FAKE_LOG: process.env.FAKE_LOG, MODEL_API_KEY: process.env.MODEL_API_KEY };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * An akm that keeps its state in the sandbox, logs every call to FAKE_LOG, and answers as FAKE_PLAN says for the ref it is
 * given: what reflect did, and the proposal it made. It refuses to run reflect before feedback is recorded.
 */
const FAKE_AKM = `
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const [cmd, ...rest] = args;
const plan = JSON.parse(process.env.FAKE_PLAN ?? "{}");
const stateFile = process.env.AKM_STATE_DIR + "/fake.json";
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { fed: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const out = (o) => console.log(JSON.stringify(o));
const note = (ref) => {
  const indexed = plan.__indexedRefs ?? {};
  const path = Object.keys(indexed).find((path) => indexed[path] === ref);
  return path ? join(process.env.AKM_BUNDLE_DIR, path) : [ref + ".md", ref + "/SKILL.md"].map((p) => process.env.AKM_BUNDLE_DIR + "/" + p).find((p) => existsSync(p));
};
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const dbFile = process.env.AKM_DATA_DIR + "/state.db";
const searches = (ref) => { if (!ref || !existsSync(dbFile)) return []; const db = new Database(dbFile, { readonly: true }); try { return db.prepare("SELECT query FROM usage_events WHERE event_type = 'search' AND source = 'user' AND entry_ref = ?").all("bundle//" + ref).map((r) => r.query); } finally { db.close(); } };
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, searches: searches(rest[0]), bundle: process.env.AKM_BUNDLE_DIR, cwd: process.cwd(), model: config.engines?.reflect?.model, provider: config.engines?.reflect?.provider ?? null, temperature: config.engines?.reflect?.temperature ?? null, thinking: config.engines?.reflect?.enableThinking ?? null, key: process.env.MODEL_API_KEY ?? null, note: rest[0] && note(rest[0]) ? readFileSync(note(rest[0]), "utf8") : null }) + "\\n");
if (cmd === "--version") console.log("akm 0.9.99-test");
else if (cmd === "index") {
  const db = new Database(join(process.env.AKM_DATA_DIR, "index.db"));
  db.exec("CREATE TABLE entries (file_path TEXT, concept_id TEXT)");
  const walk = (dir, prefix = "") => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), path + "/");
    else if (path.endsWith(".md")) db.query("INSERT INTO entries VALUES (?, ?)").run(join(dir, entry.name), plan.__indexedRefs?.[path] ?? path.replace(/\\.md$/, "").replace(/\\/SKILL$/, ""));
  } };
  walk(process.env.AKM_BUNDLE_DIR);
  db.close();
  out({ ok: true });
}
else if (cmd === "feedback") { const db = new Database(dbFile); db.exec("CREATE TABLE IF NOT EXISTS usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, query TEXT, entry_id INTEGER, entry_ref TEXT, signal TEXT, metadata TEXT, source TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT (datetime('now')))"); db.close(); state.fed.push(rest[0]); save(); out({ ok: true, ref: rest[0], signal: "negative" }); }
else if (cmd === "improve") {
  const ref = rest[0];
  if (!state.fed.includes(ref)) { console.error("no feedback was recorded for " + ref); process.exit(2); }
  const p = plan[ref] ?? { outcome: "none" };
  const action = (mode, result) => out({ ok: true, actions: [{ ref, mode, result }], usageReport: { byProcessEngineModel: [{ process: "reflect", engine: "reflect", model: p.served ?? "served-model", calls: 1 }] } });
  if (p.outcome === "slow") await new Promise((resolve) => setTimeout(resolve, 30000));
  if (p.outcome === "crash") { console.error(JSON.stringify({ error: "boom", code: "INTERNAL" })); process.exit(70); }
  else if (p.outcome === "proposal") { state.proposal = { id: "prop-1", source: "reflect", ref, content: p.content }; save(); action("reflect", { ok: true, proposal: { id: "prop-1" } }); }
  else if (p.outcome === "none") action("reflect-skipped", { ok: false, reason: "no_change", error: "identical" });
  else if (p.outcome === "refused") action("reflect-failed", { ok: false, reason: "quality_rejected", error: "placeholder_added" });
  else if (p.outcome === "unusable") action("reflect-failed", { ok: false, reason: "parse_error", error: "not JSON" });
  else if (p.outcome === "provider") action("reflect-failed", { ok: false, reason: "non_zero_exit", error: "HTTP 500 from " + config.engines.reflect.endpoint });
  else if (p.outcome === "two") { state.proposal = { id: "prop-1", source: "reflect", ref, content: "x" }; state.two = true; save(); action("reflect", { ok: true, proposal: { id: "prop-1" } }); }
}
else if (cmd === "proposal" && rest[0] === "list") out({ totalCount: state.proposal ? 1 : 0, proposals: state.proposal ? [{ id: state.proposal.id, ref: "bundle//" + state.proposal.ref, source: state.proposal.source }, ...(state.two ? [{ id: "prop-2", ref: "bundle//" + state.proposal.ref, source: "reflect" }] : [])] : [] });
else if (cmd === "proposal" && rest[0] === "show") out({ proposal: { id: rest[1], ...(args.includes("full") ? { payload: { content: state.proposal.content } } : {}) } });
else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

const NOTE = `---
name: key-rotation
type: knowledge
description: Explains how to rotate the signing keys of the example service without downtime and how to verify the new key.
when_to_use: Use when a signing key is about to expire or may have leaked.
updated: 2026-01-02
---

# Key rotation

Rotate the keys in staging first, then promote the change to production.
`;

const make = (id: string, cls: Case["class"], path: string, extra: Partial<Case> = {}): Case => {
  const source = inject(cls, NOTE) as string;
  const fix = cls === "when-to-use-missing" ? "when_to_use" : undefined;
  return { id, class: cls, path, source, feedback: `Feedback for ${id}.`, defect: "d", correct: "c", ...(fix ? { fix } : {}), allow: fix ? [fix] : [], ...extra };
};

/** Assets and a fake akm in a temp folder. `plan` says what the fake does for each ref. */
function setup(cases: Case[], plan: Record<string, object>) {
  const root = mkdtempSync(join(tmpdir(), "reflect-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_PLAN = JSON.stringify(plan);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  const ctx = { baseUrl: "http://localhost:9/v1", model: "the-model", hasKey: true, version: "0.9.99-test", label: "t" };
  const calls = () => (existsSync(process.env.FAKE_LOG as string) ? readFileSync(process.env.FAKE_LOG as string, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  return { ctx, calls, folders: { assets, results: join(root, "results") } };
}

/** A corpus as resolveCorpora gives it, for a folder of cases a test made. */
const corpusOf = (folder: string, name: "public" | "custom" = "public", custom: { rewrite: boolean; seed: string | null } = { rewrite: false, seed: null }): ResolvedCorpus => ({ name, folder, ...custom, flag: `--corpus ${name}` });

/** runCorpus on the public corpus: `folders` holds its cases (assets) and the folder the results go to. */
const runPublic = (ctx: Parameters<typeof runCorpus>[1], folders: { assets: string; results: string }) => runCorpus(corpusOf(folders.assets), ctx, folders.results);

/**
 * The keys of the summary.json that reflect wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts, without results_dir, which is
 * returned and not written. scripts/ledger, scripts/compare and scripts/rescore read them, so none may go. A run adds concurrency and timeout_ms to them.
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "retrieval_queries", "served", "metrics", "model_calls", "semantic_verification", "manifest"];

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

describe("runCorpus", () => {
  test("uses the indexed ref for nested agents, including the recorded retrieval queries", async () => {
    const c = make("nested-agent", "when-to-use-missing", "knowledge/nested/community-manager.md");
    const ref = "agents/knowledge/nested/community-manager";
    const { ctx, calls, folders } = setup([c], { __indexedRefs: { [c.path]: ref }, [ref]: { outcome: "none" } });
    const summary = await quiet(() => runPublic({ ...ctx, queries: new Map([[refOf(c.path), ["community moderation"]]]) }, folders));
    expect(summary.n_errored).toBe(0);
    expect(calls().find((call) => call.args[0] === "feedback").args[1]).toBe(ref);
    const improve = calls().find((call) => call.args[0] === "improve");
    expect(improve.args[1]).toBe(ref);
    expect(improve.searches).toEqual(["community moderation"]);
  });
  const cases = [
    make("fix-ok", "when-to-use-missing", "knowledge/a.md"),
    make("fix-none", "when-to-use-missing", "knowledge/b.md"),
    make("keep-ok", "retrieval-miss", "skills/c/SKILL.md"),
    make("keep-churn", "retrieval-miss", "knowledge/d.md"),
    make("refused", "retrieval-miss", "knowledge/e.md"),
    make("unusable", "retrieval-miss", "knowledge/f.md"),
    make("provider", "retrieval-miss", "knowledge/g.md"),
    make("crash", "retrieval-miss", "knowledge/h.md"),
  ];
  const plan = {
    "knowledge/a": { outcome: "proposal", content: NOTE },
    "knowledge/b": { outcome: "none", served: "other-name" },
    "skills/c": { outcome: "none" },
    "knowledge/d": { outcome: "proposal", content: NOTE.replace("Use when", "Use if") },
    "knowledge/e": { outcome: "refused" },
    "knowledge/f": { outcome: "unusable" },
    "knowledge/g": { outcome: "provider" },
    "knowledge/h": { outcome: "crash" },
  };

  test("scores each outcome, keeps the unusable as a miss, scores the refused edit of a control by the note it leaves, and leaves an error out of the counts", async () => {
    const { ctx, folders } = setup(cases, plan);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "reflect", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 8, n_run: 8, n_scored: 6, n_errored: 2 });
    expect(summary.metrics.defects).toEqual({ n: 2, correct: 1, rate: 0.5 });
    expect(summary.metrics.controls).toEqual({ n: 4, correct: 2, rate: 0.5 });
    expect(summary.metrics.classes["retrieval-miss"]).toMatchObject({ n: 4, correct: 2, outcomes: { none: 1, proposal: 1, refused: 1, unusable: 1, error: 2 }, failed: { no_extra_change: 1 } });
    expect(summary.metrics.classes["when-to-use-missing"]).toMatchObject({ n: 2, correct: 1, outcomes: { proposal: 1, none: 1 }, failed: { defect_fixed: 1 } });
    expect(summary.metrics.proposals).toEqual({ n: 2, touched_body: 0 });
    expect(summary.served).toEqual({ "served-model": 5, "other-name": 1 }); // an error, whether akm crashed or the provider failed, answered nothing

    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual([
      ["fix-ok", "proposal", true],
      ["fix-none", "none", false],
      ["keep-ok", "none", true],
      ["keep-churn", "proposal", false],
      ["refused", "refused", true],
      ["unusable", "unusable", false],
      ["provider", "error", null],
      ["crash", "error", null],
    ]);
    expect(rows[0]).toMatchObject({ changed: ["when_to_use"], values: { when_to_use: "Use when a signing key is about to expire or may have leaked." }, served: "served-model" });
    expect(rows[0].proposal).toBe(NOTE);
    expect(rows[1].proposal).toBeUndefined();
    expect(rows[1].served).toBe("other-name");
    expect(rows[6].served).toBeUndefined();
    expect(rows[7].served).toBeUndefined();
    expect(rows[6].error).toBe("non_zero_exit: HTTP 500 from <MODEL_BASE_URL>/chat/completions"); // the endpoint is not in the results
    expect(rows[7].error).toContain("boom");
  });

  test("runs each case in a bundle of its own, with the note in it, and records the feedback before reflect runs", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 3), plan);
    await quiet(() => runPublic(ctx, folders));
    const log = calls();
    const first = log.filter((c) => c.args[0] !== "--version").slice(0, 5);
    expect(first.map((c) => c.args.slice(0, 2).join(" "))).toEqual(["index --format", "feedback knowledge/a", "improve knowledge/a", "proposal list", "proposal show"]);
    expect(first[1].args).toEqual(["feedback", "knowledge/a", "--negative", "--reason", "Feedback for fix-ok.", "--format", "json"]);
    expect(first[2].args).toEqual(["improve", "knowledge/a", "--strategy", "reflect-only", "--json-to-stdout", "--format", "json"]);
    expect(first[4].args).toEqual(["proposal", "show", "prop-1", "--detail", "full", "--format", "json"]);
    expect(first[2].note).toBe(cases[0]?.source); // the note, byte for byte
    expect(log.find((c) => c.args[1] === "skills/c")?.note).toBe(cases[2]?.source); // a skill sits in its own folder, as SKILL.md
    // a fresh sandbox for each case, gone afterwards, with the model and its key
    const bundles = new Set(log.map((c) => c.bundle));
    expect(bundles.size).toBe(3);
    for (const b of bundles) expect(existsSync(b)).toBe(false);
    expect(new Set(log.map((c) => c.cwd)).size).toBe(3);
    expect(log.every((c) => c.model === "the-model" && c.key === "model-secret")).toBe(true);
  });

  test("sends akm the engine at temperature 0 with thinking off, and the summary records the config without secrets, the engine settings and a digest of the cases", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 1), plan);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(calls().filter((c) => c.args[0] !== "--version").every((c) => c.temperature === 0 && c.thinking === false)).toBe(true);
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
    expect(text).not.toContain("model-secret");
    const stored = JSON.parse(text);
    expect(stored.config).toEqual(hideEndpoint(JSON.parse(JSON.stringify(reflectConfig(ctx.baseUrl, ctx.model, ctx.hasKey))), ctx.baseUrl)); // the key is the reference "$MODEL_API_KEY", which holds no secret, and the endpoint is <MODEL_BASE_URL>
    const settings = { model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 };
    expect(stored.engine).toEqual({ engine: "reflect", ...settings, engines: { reflect: settings } });
    expect(settings.endpoint).toBe("http://localhost:9"); // the host: never the path
    expect(stored.assets_sha256).toBe(assetsSha256(folders.assets));
    expect(stored).toMatchObject({ seed: null, status: "complete", aborted_reason: null, timeouts: 0 });


    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
    const again = await quiet(() => runPublic(ctx, setup(cases.slice(0, 1), plan).folders));
    expect(again.assets_sha256).toBe(stored.assets_sha256);
    const other = await quiet(() => runPublic(ctx, setup(cases.slice(0, 2), plan).folders));
    expect(other.assets_sha256).not.toBe(stored.assets_sha256);
  });

  test("the config in the summary has a literal key redacted and the patch merged in", async () => {
    const { ctx, folders } = setup(cases.slice(0, 1), plan);
    const root = mkdtempSync(join(tmpdir(), "reflect-patch-"));
    dirs.push(root);
    writeFileSync(join(root, "patch.json"), JSON.stringify({ engines: { reflect: { apiKey: "sk-literal-secret", temperature: 0.7 } } }));
    const configPatch = loadConfigPatch("patch.json", root);
    const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "reflect-only", configPatch } }, folders));
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
    expect(text).not.toContain("sk-literal-secret");
    const stored = JSON.parse(text);
    expect(stored.config.engines.reflect).toMatchObject({ apiKey: "<redacted>", temperature: 0.7 });
    expect(stored.engine.temperature).toBe(0.7); // what the run was made with, patch included
  });

  test("records the corpus: public, or custom with its kind and whether it is private, the seed of a rewrite, and no folder outside the repository", async () => {
    const { ctx, folders } = setup(cases.slice(0, 1), plan);
    const record = async (corpus: ResolvedCorpus) => {
      const summary = await quiet(() => runCorpus(corpus, ctx, folders.results));
      const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
      expect(text).not.toContain(folders.assets); // the folder of a corpus can name what is in it
      const stored = JSON.parse(text);
      expect(stored.manifest.corpus).toBe(stored.corpus);
      return stored;
    };
    const [pub, rew, mine] = [corpusOf(folders.assets), corpusOf(folders.assets, "custom", { rewrite: true, seed: "42" }), corpusOf(folders.assets, "custom")];
    expect(await record(pub)).toMatchObject({ corpus: "public", corpus_folder: null, seed: null });
    expect(await record(rew)).toMatchObject({ corpus: "custom", corpus_folder: null, seed: "42" });
    expect(await record(mine)).toMatchObject({ corpus: "custom", corpus_folder: null, seed: null });
  });

  test("records the folder of a custom corpus from the repository root when it is inside it, null when it is not, and null for the public corpus", () => {
    const custom = (folder: string) => corpusOf(folder, "custom");
    expect(corpusFolder(custom(join(REPO, "private", "reflect", "assets")), REPO)).toBe("private/reflect/assets");
    expect(corpusFolder(custom(join(REPO, "private", "reflect", "own notes")), REPO)).toBe("private/reflect/own notes");
    expect(corpusFolder(custom(REPO), REPO)).toBeNull();
    expect(corpusFolder(custom(join(REPO, "..", "reflect-notes")), REPO)).toBeNull();
    expect(corpusFolder(custom(join(REPO, "..", `${basename(REPO)}-copy`, "assets")), REPO)).toBeNull(); // a sibling folder whose name starts like the repository's
    expect(corpusFolder(corpusOf(join(REPO, "evals", "reflect", "assets")), REPO)).toBeNull();
  });

  test("a custom corpus puts its results in private/reflect/results unless told otherwise, and the public one in the eval's own folder", () => {
    expect(defaultResults(corpusOf("x", "custom"), REPO)).toBe(join(REPO, "private", "reflect", "results"));
    expect(defaultResults(corpusOf("x"), REPO)).toBe(join(REPO, "evals", "reflect", "results"));
  });

  test("runs the strategy it is given, with the config patch merged into the config, and records both", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 1), plan);
    const root = mkdtempSync(join(tmpdir(), "reflect-patch-"));
    dirs.push(root);
    writeFileSync(join(root, "patch.json"), JSON.stringify({ engines: { reflect: { model: "patched-model" } } }));
    const configPatch = loadConfigPatch("patch.json", root);
    const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "reflect-judged", configPatch } }, folders));
    const log = calls();
    expect(log.find((c) => c.args[0] === "improve").args).toEqual(["improve", "knowledge/a", "--strategy", "reflect-judged", "--json-to-stdout", "--format", "json"]);
    expect(log.filter((c) => c.args[0] !== "--version").every((c) => c.model === "patched-model")).toBe(true);
    expect(summary).toMatchObject({ strategy: "reflect-judged", config_patch: { path: "patch.json", sha256: configPatch.sha256 } });
  });

  test("without the flags it records its own strategy and no patch", async () => {
    const { ctx, folders } = setup(cases.slice(0, 1), plan);
    expect(await quiet(() => runPublic(ctx, folders))).toMatchObject({ strategy: "reflect-only", config_patch: null });
  });

  test("records the queries it is given as searches that found the note, before reflect runs, and counts the cases that have some", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 3), plan);
    const summary = await quiet(() => runPublic({ ...ctx, queries: new Map([["knowledge/a", ["rotate signing keys", "key expiry"]], ["skills/c", ["unrelated"]]]) }, folders));
    const improves = calls().filter((c) => c.args[0] === "improve");
    expect(improves.map((c) => [c.args[1], c.searches])).toEqual([["knowledge/a", ["rotate signing keys", "key expiry"]], ["knowledge/b", []], ["skills/c", ["unrelated"]]]);
    expect(summary.retrieval_queries).toEqual({ cases: 2 });
    expect((await quiet(() => runPublic(ctx, folders))).retrieval_queries).toBeNull();
  });

  test("a limit runs the first cases", async () => {
    const { ctx, calls, folders } = setup(cases, plan);
    const summary = await quiet(() => runPublic({ ...ctx, limit: 2 }, folders));
    expect(summary).toMatchObject({ limit: 2, n_cases: 8, n_run: 2 });
    expect(calls().filter((c) => c.args[0] === "improve").map((c) => c.args[1])).toEqual(["knowledge/a", "knowledge/b"]);
  });

  test("a queue that does not hold the one proposal reflect made is an error, not a score", async () => {
    const { ctx, folders } = setup([make("two", "retrieval-miss", "knowledge/a.md")], { "knowledge/a": { outcome: "two" } });
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ n_run: 1, n_scored: 0, n_errored: 1 });
    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    expect(JSON.parse(readFileSync(join(dir, "samples.jsonl"), "utf8")).error).toBe("reflect made a proposal but the queue holds 2");
  });

  test("gives up after five errored cases in a row, and says what to check", async () => {
    const many = Array.from({ length: 12 }, (_, i) => make(`c${i}`, "retrieval-miss", `knowledge/n${i}.md`));
    const { ctx, folders } = setup(many, Object.fromEntries(many.map((c) => [refOf(c.path), { outcome: "provider" }])));
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 cases in a row errored, so the run stopped after 5 of 12");
    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(summary.n_run).toBe(5);
    expect(summary.n_scored).toBe(0);
  });

  test("a run that stops early says so in the summary it writes before it fails", async () => {
    const many = Array.from({ length: 12 }, (_, i) => make(`c${i}`, "retrieval-miss", `knowledge/n${i}.md`));
    const { ctx, folders } = setup(many, Object.fromEntries(many.map((c) => [refOf(c.path), { outcome: "provider" }])));
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("Check MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and that akm can reach the model.");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0] as string, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ status: "aborted", n_run: 5, n_cases: 12 });
    expect(stored.aborted_reason).toBe("5 cases in a row errored, so the run stopped after 5 of 12. Last error: non_zero_exit: HTTP 500 from <MODEL_BASE_URL>/chat/completions");
  });

  test("a good case between the errors starts the count again, so eight errors with a verdict in the middle do not give up", async () => {
    const mixed = Array.from({ length: 9 }, (_, i) => make(`c${i}`, "retrieval-miss", `knowledge/n${i}.md`));
    const { ctx, folders } = setup(mixed, Object.fromEntries(mixed.map((c, i) => [refOf(c.path), { outcome: i === 4 ? "none" : "provider" }])));
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ status: "complete", aborted_reason: null, n_run: 9, n_scored: 1, n_errored: 8 });
  });

  test("the summary has every key it has always had, which scripts/ledger, compare and rescore read, and concurrency and timeout_ms besides", async () => {
    const { ctx, folders } = setup(cases.slice(0, 2), plan);
    const summary = await quiet(() => runPublic(ctx, folders));
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms"].sort());
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(stored), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(stored).toMatchObject({ concurrency: 1, timeout_ms: 900_000, timeouts: 0, retrieval_queries: null });
    expect(stored.served).toEqual({ "served-model": 1, "other-name": 1 });
  });

  test("gives the engine the provider kind of the context, in the config akm reads and in the summary, and openai without one", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 1), plan);
    const summary = await quiet(() => runPublic({ ...ctx, provider: "groq" }, folders));
    const log = calls().filter((c) => c.args[0] !== "--version");
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((c) => c.provider === "groq")).toBe(true);
    expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8")).config.engines.reflect.provider).toBe("groq");
    const plain = setup(cases.slice(0, 1), plan);
    const again = await quiet(() => runPublic(plain.ctx, plain.folders));
    expect(plain.calls().filter((c) => c.args[0] !== "--version").every((c) => c.provider === "openai")).toBe(true);
    expect(JSON.parse(readFileSync(join(again.results_dir, "summary.json"), "utf8")).config.engines.reflect.provider).toBe("openai");
  });

  test("an akm that runs past its timeout is an errored case marked timed_out, and the summary counts the timeouts apart from the other errors", async () => {
    const slow = [make("slow", "retrieval-miss", "knowledge/s.md"), make("crash", "retrieval-miss", "knowledge/c.md"), make("ok", "retrieval-miss", "knowledge/o.md")];
    const { ctx, folders } = setup(slow, { "knowledge/s": { outcome: "slow" }, "knowledge/c": { outcome: "crash" } });
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 1500 }, folders));
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[0]).toMatchObject({ id: "slow", outcome: "error", timed_out: true, error: "akm improve timed out after 1.5s" });
    expect(rows[1].outcome).toBe("error");
    expect("timed_out" in rows[1]).toBe(false);
    expect("timed_out" in rows[2]).toBe(false);
    expect(summary).toMatchObject({ n_run: 3, n_scored: 1, n_errored: 2, timeouts: 1, timeout_ms: 1500 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.timeouts).toBe(1);
    expect([stored.timeout_ms, stored.manifest.settings.timeout_ms]).toEqual([1500, 1500]); // the timeout the run had, not null
  });
});

describe("the manifest of a run", () => {
  const cases = [
    make("fix-ok", "when-to-use-missing", "knowledge/a.md"),
    make("keep-ok", "retrieval-miss", "skills/c/SKILL.md"),
    make("refused", "retrieval-miss", "knowledge/e.md"),
    make("provider", "retrieval-miss", "knowledge/g.md"),
    make("crash", "retrieval-miss", "knowledge/h.md"),
  ];
  const plan = {
    "knowledge/a": { outcome: "proposal", content: NOTE },
    "skills/c": { outcome: "none" },
    "knowledge/e": { outcome: "refused" },
    "knowledge/g": { outcome: "provider" },
    "knowledge/h": { outcome: "crash" },
  };
  const stored = (summary: { results_dir: string }) => JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
  const samples = (summary: { results_dir: string }) => readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

  test("is sound, carries the eval's version, and a digest of the input and the labels of every case it selected", async () => {
    const { ctx, folders } = setup(cases, plan);
    const summary = await quiet(() => runPublic(ctx, folders));
    const { manifest } = stored(summary);
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(stored(summary)).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "reflect", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: summary.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "reflect-only", config_patch_sha256: null, timeout_ms: 900_000, seed: null }); // the effective timeout, runAkm's default here; it used to be recorded as null
    expect(Object.keys(manifest.cases)).toEqual(cases.map((c) => c.id));
    const first = cases[0] as Case;
    expect(manifest.cases["fix-ok"]).toEqual({
      input_sha256: sha256Json({ path: first.path, source: first.source, feedback: first.feedback, searches: [] }),
      label_sha256: sha256Json({ class: first.class, source: first.source, allow: first.allow, forbid: [], anchors: [] }),
    });
    expect(manifest.completion).toEqual({ selected: cases.map((c) => c.id), scored: ["fix-ok", "keep-ok", "refused"], errored: ["provider", "crash"] });
  });

  test("holds the config without the model's settings and the engines with a host and a digest, and the summary's config has the same digest", async () => {
    const { ctx, folders } = setup(cases.slice(0, 1), plan);
    const { manifest, config, engine } = stored(await quiet(() => runPublic(ctx, folders)));

    expect(manifest.config.redacted).toEqual(withoutEngineSettings(config));
    expect(JSON.stringify(manifest.config.redacted)).not.toContain("localhost");
    expect(manifest.engines).toEqual(engine.engines);
    expect(manifest.engines.reflect).toEqual({ model: "the-model", endpoint: "http://localhost:9", temperature: 0, enableThinking: false, timeoutMs: 600_000 });
  });

  test("a path segment of the model URL is in no summary and no row, only its host and the digest (#65)", async () => {
    const { ctx, folders } = setup(cases, plan);
    const url = "https://gateway.example/k-DUMMYSECRET0123/v1";
    const summary = await quiet(() => runPublic({ ...ctx, baseUrl: url }, folders));
    for (const file of ["summary.json", "samples.jsonl"]) {
      const text = readFileSync(join(summary.results_dir, file), "utf8");
      expect(text).not.toContain("DUMMYSECRET0123");
      expect(text).not.toContain("k-DUMMY");
    }
    const { manifest, engine } = stored(summary);
    expect(manifest.engines.reflect).toMatchObject({ endpoint: "https://gateway.example" });
    expect(engine.endpoint).toBe("https://gateway.example");
    // two deployments on one host are one endpoint
    const other = stored(await quiet(() => runPublic({ ...ctx, baseUrl: "https://gateway.example/deployment-B/v1" }, setup(cases.slice(0, 1), plan).folders)));
    expect(other.manifest.engines.reflect).toEqual(manifest.engines.reflect);
  });

  test("the searches a run records are part of the input of the notes they are for, so --retrieval-queries is part of the run's identity (#37)", async () => {
    const { ctx, folders } = setup(cases, plan);
    const without = stored(await quiet(() => runPublic(ctx, folders))).manifest;
    const queries = new Map([["knowledge/a", ["rotate signing keys"]], ["skills/c", ["key expiry", "unrelated"]]]);
    const withQueries = stored(await quiet(() => runPublic({ ...ctx, queries }, setup(cases, plan).folders))).manifest;
    const changed = Object.keys(without.cases).filter((id) => without.cases[id].input_sha256 !== withQueries.cases[id].input_sha256);
    expect(changed).toEqual(["fix-ok", "keep-ok"]); // the two notes that have searches; the other three present what they did before
    for (const id of Object.keys(without.cases)) expect(withQueries.cases[id].label_sha256).toBe(without.cases[id].label_sha256);
    expect({ ...withQueries, cases: null, akm: null }).toEqual({ ...without, cases: null, akm: null }); // and nothing else of the run differs (the fake akm is in a folder of its own each time)
    // other searches for one note are another input for that note only
    const moved = stored(await quiet(() => runPublic({ ...ctx, queries: new Map([["knowledge/a", ["rotate signing keys"]], ["skills/c", ["key expiry", "something else"]]]) }, setup(cases, plan).folders))).manifest;
    expect(Object.keys(without.cases).filter((id) => moved.cases[id].input_sha256 !== withQueries.cases[id].input_sha256)).toEqual(["keep-ok"]);
  });

  test("every row holds the raw output the scorer reads: scoring it again gives the row (outcomes proposal, none, refused, error)", async () => {
    const { ctx, folders } = setup(cases, plan);
    const summary = await quiet(() => runPublic(ctx, folders));
    const rows = samples(summary);
    expect(rows.map((r) => r.outcome)).toEqual(["proposal", "none", "refused", "error", "error"]);
    rows.forEach((row, i) => {
      const read = MEASUREMENT.rawOf(row);
      expect("raw" in read).toBe(true);
      expect(MEASUREMENT.score(cases[i] as Case, (read as { raw: Raw }).raw)).toEqual(row);
    });
    expect(MEASUREMENT.summarize(rows)).toMatchObject({ n_run: 5, n_scored: 3, n_errored: 2, metrics: summary.metrics });
  });

  test("a run that stops early keeps every selected case in the manifest, with those it never ran in neither list", async () => {
    const many = Array.from({ length: 12 }, (_, i) => make(`c${i}`, "retrieval-miss", `knowledge/n${i}.md`));
    const { ctx, folders } = setup(many, Object.fromEntries(many.map((c) => [refOf(c.path), { outcome: "provider" }])));
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 cases in a row errored, so the run stopped after 5 of 12");
    const { manifest } = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0] as string, "summary.json"), "utf8"));
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifest.completion).toEqual({ selected: many.map((c) => c.id), scored: [], errored: many.slice(0, 5).map((c) => c.id) });
  });
});

describe("run --corpus custom", () => {
  const EVAL = join(import.meta.dir, "..");
  const REPO = join(EVAL, "..", "..");

  /** A copy of the code and the public assets in a temp folder, so that the run finds private/ there and never in the repository. */
  function copyOfRepo(): string {
    const tree = mkdtempSync(join(tmpdir(), "reflect tree-"));
    dirs.push(tree);
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "src"), join(tree, "evals", "reflect", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "reflect", "assets"), { recursive: true });
    mkdirSync(join(tree, "evals", "retrieval", "assets"), { recursive: true }); // the labelled queries that --retrieval-queries reads
    for (const file of ["queries.jsonl", "qrels.jsonl"]) cpSync(join(REPO, "evals", "retrieval", "assets", file), join(tree, "evals", "retrieval", "assets", file));
    return tree;
  }
  const bun = (tree: string, script: string, args: string[]) => {
    // akm is not there, so a run that gets past its checks stops at the version probe, before it calls a model.
    const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "", AKM_BIN: commandLine([join(tree, "no-akm")]) };
    const p = Bun.spawnSync(["bun", join(tree, "evals", "reflect", "src", script), ...args], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode, err: p.stderr.toString() };
  };
  /** A folder of your own notes, outside the tree: the first cases of the public set, as a person would keep theirs. */
  function ownNotes(): string {
    const dir = mkdtempSync(join(tmpdir(), "reflect own notes-"));
    dirs.push(dir);
    writeFileSync(join(dir, "cases.jsonl"), `${readFileSync(join(EVAL, "assets", "cases.jsonl"), "utf8").split("\n").slice(0, 10).join("\n")}\n`);
    return dir;
  }

  test("stops before anything runs when the custom corpus is not there", () => {
    const tree = copyOfRepo();
    const none = bun(tree, "run.ts", ["--corpus", "custom"]);
    expect(none.code).toBe(2);
    expect(none.err).toContain("--corpus custom: private/reflect/assets/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does. Make the rewrite with: ./generate-assets --only reflect");
    const empty = mkdtempSync(join(tmpdir(), "reflect empty notes-"));
    dirs.push(empty);
    const mine = bun(tree, "run.ts", ["--cases", empty]);
    expect(mine.code).toBe(2);
    expect(mine.err).toContain(`--cases ${empty}: ${empty}/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does.`);
    expect(mine.err).not.toContain("generate-assets"); // a folder of your own is not made by it
    expect(mine.err).not.toContain("could not run");
  }, 60_000);

  test("--retrieval-queries takes the queries through the map of the rewrite, and a missing file stops the run before it starts, with the instruction to make the assets again (#60)", () => {
    const tree = copyOfRepo();
    const out = join(tree, "private", "reflect");
    expect(bun(tree, "generate.ts", ["--seed", "5", "--out", out]).code).toBe(0);
    const ready = bun(tree, "run.ts", ["--corpus", "all", "--retrieval-queries"]);
    expect(ready.err).toContain("could not run"); // both corpora have their queries, and the run stopped for want of akm
    expect(ready.err).not.toContain("--retrieval-queries");

    rmSync(join(out, "map.json"));
    const noMap = bun(tree, "run.ts", ["--corpus", "all", "--retrieval-queries"]);
    expect(noMap.code).toBe(2);
    expect(noMap.err).toContain("--retrieval-queries maps the queries through the rewrite map that generate writes beside the assets, and private/reflect/map.json is missing. Make the private assets again with: ./generate-assets --only reflect");
    expect(noMap.err).not.toContain("could not run");
    expect(bun(tree, "run.ts", ["--corpus", "public", "--retrieval-queries"]).err).toContain("could not run"); // the public corpus needs no map

    rmSync(join(tree, "evals", "retrieval", "assets", "qrels.jsonl"));
    const noQrels = bun(tree, "run.ts", ["--corpus", "public", "--retrieval-queries"]);
    expect(noQrels.code).toBe(2);
    expect(noQrels.err).toContain("--retrieval-queries reads the retrieval eval's labelled queries, and evals/retrieval/assets/qrels.jsonl is missing");
    expect(noQrels.err).not.toContain("could not run");
  }, 60_000);

  test("the corpus names of before 0.2 and the flags --yes and -y are refused: the run stops before it reaches akm", () => {
    const tree = copyOfRepo();
    for (const old of ["own", "own-feedback", "private", "everything"]) {
      const done = bun(tree, "run.ts", ["--corpus", old]);
      expect(done.code, old).toBe(2);
      expect(done.err, old).toContain(`reflect: --corpus must be public, custom or all, not "${old}"`);
      expect(done.err, old).not.toContain("could not run");
    }
    for (const flag of ["-y", "--yes"]) {
      const done = bun(tree, "run.ts", ["--corpus", "public", flag]);
      expect(done.code, flag).toBe(2);
      expect(done.err, flag).toStartWith("reflect: ");
      expect(done.err, flag).toContain("Usage: evals/reflect/run");
      expect(done.err, flag).not.toContain("could not run");
    }
  }, 60_000);

  test("a folder of your own goes on to the akm check, and takes no --retrieval-queries", () => {
    const tree = copyOfRepo();
    const notes = ownNotes();
    expect(bun(tree, "run.ts", ["--cases", notes]).err).toContain("could not run"); // stopped for want of akm
    const queried = bun(tree, "run.ts", ["--cases", notes, "--retrieval-queries"]);
    expect(queried.code).toBe(2);
    expect(queried.err).toContain(`--retrieval-queries does not apply to --cases ${notes}`); // the queries are those of the public notes: they are matched by public ref
  }, 60_000);

  test("--concurrency and --timeout-ms reach the run through reflect's flags: every case has its row, akm is probed once, and both are recorded", () => {
    const tree = copyOfRepo();
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const log = join(tree, "calls.jsonl");
    const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "", AKM_BIN: commandLine(["bun", script]), FAKE_LOG: log, FAKE_PLAN: "{}" };
    const p = Bun.spawnSync(["bun", join(tree, "evals", "reflect", "src", "run.ts"), "--corpus", "public", "--limit", "4", "--concurrency", "3", "--timeout-ms", "20000", "--label", "flags"], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
    expect([p.exitCode, p.stderr.toString()]).toEqual([0, ""]);
    const results = join(tree, "evals", "reflect", "results");
    const folder = join(results, readdirSync(results).find((name) => name.endsWith("-flags")) as string);
    const stored = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
    const rows = readFileSync(join(folder, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    expect(stored).toMatchObject({ concurrency: 3, timeout_ms: 20_000, n_run: 4, status: "complete" });
    expect(stored.manifest.settings.timeout_ms).toBe(20_000);
    expect(rows.map((r) => r.id).sort()).toEqual([...stored.manifest.completion.selected].sort());
    const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(calls.filter((c) => c.args[0] === "--version")).toHaveLength(1);
    expect(calls.filter((c) => c.args[0] === "improve")).toHaveLength(4);
  }, 60_000);
});

/**
 * The real akm these tests run against, only when AKM_EVAL_REAL_AKM=1 asks for it: an akm that happens to be on PATH, or an
 * AKM_BIN the caller exported, is never picked up by itself, so the default suite stays fake-only whatever is installed.
 * It must be new enough to run this eval.
 */
function realAkm(): string | undefined {
  if (process.env.AKM_EVAL_REAL_AKM !== "1") return undefined;
  const cmd = (process.env.AKM_BIN?.trim() || "akm").split(/\s+/);
  try {
    const out = Bun.spawnSync([...cmd, "--version"], { stdout: "pipe", stderr: "ignore" });
    const version = out.stdout.toString().match(/\d+\.\d+\.\d+\S*/)?.[0];
    return out.exitCode === 0 && version && atLeast(version, MIN_AKM) ? version : undefined;
  } catch {
    return undefined;
  }
}
const realVersion = realAkm();

describe.skipIf(!realVersion)(`with the akm on this machine (${realVersion})`, () => {
  const LIBRARY = join(import.meta.dir, "..", "..", "..", "corpus", "library");
  const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8")).slice(0, 10); // one case of each class

  /** A model that answers as a script says. The oracle restores what the injection took away from the clean note. */
  function model(mode: "oracle" | "nothing" | "churn") {
    const byRef = new Map(cases.map((c) => [refOf(c.path), c]));
    const original = (c: Case) => {
      const clean = readFileSync(join(LIBRARY, libraryFileOf(c.path)), "utf8");
      const fm = Bun.YAML.parse(clean.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "") as Record<string, string>;
      const squash = (s?: string) => (s ? s.replace(/\s+/g, " ").trim() : null);
      return { description: squash(fm.description), when_to_use: squash(fm.when_to_use), title: squash(fm.title) ?? clean.match(/^#[ \t]+(\S.*)$/m)?.[1] ?? null };
    };
    return Bun.serve({
      port: 0,
      async fetch(req) {
        const prompt: string = ((await req.json()) as { messages: { content: string }[] }).messages.at(-1)?.content ?? "";
        const c = byRef.get(prompt.match(/Target ref: (\S+)/)?.[1] ?? "") as Case;
        const o = original(c);
        const patch = { description: null as string | null, when_to_use: null as string | null, title: null as string | null };
        if (mode === "oracle") {
          if (c.fix === "description") patch.description = o.description;
          if (c.fix === "when_to_use") patch.when_to_use = o.when_to_use;
          if (c.fix === "title") patch.title = o.title;
        } else if (mode === "churn") {
          Object.assign(patch, { description: "A rewritten summary that says the same in new words and adds a claim about AWS.", when_to_use: "Use whenever you need help with anything related to this topic.", title: "A New Title" });
        }
        const content = JSON.stringify({ confidence: 0.9, frontmatterPatch: patch });
        return Response.json({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: {} });
      },
    });
  }

  async function runWith(mode: "oracle" | "nothing" | "churn") {
    const server = model(mode);
    const root = mkdtempSync(join(tmpdir(), "reflect-real-"));
    dirs.push(root);
    try {
      const ctx = { baseUrl: `http://127.0.0.1:${server.port}/v1`, model: "scripted", hasKey: false, version: realVersion as string, label: "t", limit: 10 };
      return await quiet(() => runPublic(ctx, { assets: join(import.meta.dir, "..", "assets"), results: join(root, "results") }));
    } finally {
      server.stop();
    }
  }

  test("a model that restores what the injection took away fixes every defect and keeps every control", async () => {
    const m = (await runWith("oracle")).metrics;
    expect(m.defects).toEqual({ n: 6, correct: 6, rate: 1 });
    expect(m.controls).toEqual({ n: 4, correct: 4, rate: 1 });
    expect(m.proposals.touched_body).toBe(0);
  }, 120_000);

  test("a model that answers nothing fixes no defect, even where akm writes a description of its own, and keeps every control", async () => {
    const m = (await runWith("nothing")).metrics;
    expect(m.defects).toEqual({ n: 6, correct: 0, rate: 0 });
    expect(m.controls).toEqual({ n: 4, correct: 4, rate: 1 });
    expect(m.classes["description-missing"]?.outcomes.proposal).toBe(1); // akm's own description is a proposal the checks do not credit
  }, 120_000);

  test("a model that rewrites every field fixes no defect and keeps no control", async () => {
    const m = (await runWith("churn")).metrics;
    expect(m.defects.correct).toBe(0);
    expect(m.controls.correct).toBe(0);
    expect(m.proposals.n).toBe(10);
  }, 120_000);
});
