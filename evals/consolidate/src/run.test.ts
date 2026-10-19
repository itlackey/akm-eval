import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { parseOverrides } from "../../../lib/akm/overrides.ts";
import { fail } from "../../../lib/cli.ts";
import { endpointHost } from "../../../lib/provenance.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { clearRunning } from "../../../lib/results.ts";
import { rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { assetsDigest } from "./inputs.ts";
import { type Case, type Embedder, INPUT_FILES, type Relation, failureHint, sandboxOptions, writeNotes } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runCorpus } from "./run.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
/** The last line of every usage text: the driver's note on the request the model gets before the first case. */
const PROBE_NOTE = "The model gets one one-token request before the first case. AKM_EVAL_NO_PROBE=1 skips it, for an endpoint that does not serve chat completions.";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that consolidates by a word in the notes: "FAKE: <what>" in either note says what the pair pass does with them. It
 * needs what the real one needs, the deterministic embedder and semantic search, and it picks the older note by file time. With FAKE_COMMANDS_LOG
 * it logs every command it is given.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const cmd = args[0];
if (process.env.FAKE_COMMANDS_LOG) appendFileSync(process.env.FAKE_COMMANDS_LOG, JSON.stringify({ args, deterministic: process.env.AKM_EMBED_DETERMINISTIC ?? null }) + "\\n");
const memories = join(process.env.AKM_BUNDLE_DIR, "memories");
const notes = (existsSync(memories) ? readdirSync(memories) : []).map((f) => ({ name: f.replace(/\\.md$/, ""), text: readFileSync(join(memories, f), "utf8"), mtime: statSync(join(memories, f)).mtimeMs }));
notes.sort((x, y) => x.mtime - y.mtime || x.name.localeCompare(y.name));
const config = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8"));
const proposals = join(process.env.AKM_STATE_DIR, "proposals.json");
const what = /FAKE: ([a-z0-9-]+)/.exec(notes.map((n) => n.text).join("\\n"))?.[1];
const has = (flag) => args.includes(flag);
const json = (o) => console.log(JSON.stringify(o));
const proposal = (name, extra = {}) => ({ id: "p-" + name, ref: "bundle//memories/" + name, status: "pending", source: "consolidate-pair", retirement: { retiredRef: "memories/" + name, successorRef: "memories/other", judgeLabel: "duplicate", judgeReason: "same claims", onlyInRetired: [], onlyInSuccessor: ["a kept claim"] }, ...extra });
const pass = (over) => ({ initiators: 2, pairsConsidered: 1, pairsJudged: 1, failedJudgments: 0, labelCounts: { duplicate: 1 }, retired: [], ...over });

if (cmd === "--version") { console.log("akm 0.9.99-test"); process.exit(0); }
if (cmd === "index") {
  if (what === "slow-index") await Bun.sleep(30000);
  if (process.env.FAKE_EMBEDDER === "real") {
    // the real embedder: no switch for the hash one, akm's model in the config, and the model's folder in the environment
    if (process.env.AKM_EMBED_DETERMINISTIC) { console.error("the deterministic embedder is on"); process.exit(3); }
    if (config.embedding?.localModel !== "Xenova/bge-small-en-v1.5" || !process.env.HF_HOME) { console.error("the real embedder is not set up"); process.exit(3); }
  } else {
    if (process.env.AKM_EMBED_DETERMINISTIC !== "1" || config.embedding) { console.error("no deterministic embedder"); process.exit(3); }
  }
  if (config.semanticSearchMode !== "auto") { console.error("semantic search is off"); process.exit(3); }
  json({ ok: true, totalEntries: notes.length, verification: { embeddingCount: notes.length } });
} else if (cmd === "improve") {
  if (args[1] !== "--strategy" || args[2] !== (process.env.FAKE_STRATEGY ?? "consolidate") || !has("--no-sync") || !has("--json-to-stdout")) { console.error("unexpected " + args.join(" ")); process.exit(2); }
  if (what === "slow-improve") await Bun.sleep(30000);
  if (what === "crash") { console.error(JSON.stringify({ ok: false, error: "boom", code: "BOOM" })); process.exit(70); }
  let list = [];
  let result = pass({});
  if (what === "retire-older") list = [proposal(notes[0].name, { gateDecision: { outcome: "staged", reason: "duplicate" } })];
  else if (what === "retire-newer") { list = [proposal(notes[1].name)]; result = pass({ labelCounts: { subsumed: 1 } }); }
  else if (what === "retire-outsider") list = [proposal("not-in-the-pair")];
  else if (what === "keep") result = pass({ labelCounts: { overlap: 1 } });
  else if (what === "promote") { list = [{ id: "p-promote", ref: "bundle//knowledge/x", status: "pending", source: "consolidate" }]; result = pass({ labelCounts: { overlap: 1 } }); }
  else if (what?.startsWith("limited-")) {
    // the endpoint turns the first N tries of a case away: the count is kept outside the sandbox, which each try makes anew
    const file = join(process.env.FAKE_COUNTER_DIR, notes[0].name + ".count");
    const seen = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
    writeFileSync(file, String(seen + 1));
    if (seen < Number(what.slice(8))) { console.error("LLM request rate limited (429) https://example.test/v1/chat/completions"); result = pass({ pairsJudged: 0, failedJudgments: 1, labelCounts: {} }); }
    else list = [proposal(notes[0].name)];
  }
  else if (what === "leaky") { console.error("LLM request failed: http://localhost:1/v1/chat/completions refused"); result = pass({ pairsJudged: 0, failedJudgments: 1, labelCounts: {} }); }
  else if (what === "leaky-crash") { console.error(JSON.stringify({ ok: false, error: "unreachable: http://localhost:1/v1/chat/completions refused" })); process.exit(70); }
  else if (what === "no-verdict") { console.error("[consolidate] chunk 1/1 (2 memories) …"); console.error("Network error: Unable to connect. Is the computer able to access the url?"); console.error("  consolidate  judge  m  2  2  0  0  0  2"); result = pass({ pairsJudged: 0, failedJudgments: 1, labelCounts: {} }); }
  else result = pass({ pairsConsidered: 0, pairsJudged: 0, labelCounts: {} });
  writeFileSync(proposals, JSON.stringify(list));
  json({ ok: true, strategy: "consolidate", consolidation: { pairPass: result, mtimes: notes.map((n) => n.mtime) }, usageReport: { byProcessEngineModel: [{ process: "consolidate", engine: "consolidate", model: notes.length % 2 === 0 ? "fake-served" : "other", calls: 2 }] } });
} else if (cmd === "proposal" && args[1] === "list") {
  if (!has("--detail")) { console.error("needs --detail full"); process.exit(2); }
  const list = existsSync(proposals) ? JSON.parse(readFileSync(proposals, "utf8")) : [];
  json({ totalCount: list.length, proposals: list });
} else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

/** The public corpus, with its cases in `folder`. */
const publicCorpus = (folder: string): ResolvedCorpus => ({ name: "public", folder, rewrite: false, seed: null, flag: "--corpus public" });

const note = (name: string, what: string) => ({ name, text: `---\ndescription: ${name}\n---\n# ${name}\n\nFAKE: ${what}\n` });

function mk(id: string, relation: Relation, what: string, over: Partial<Case> = {}): Case {
  return { id, relation, older: "a", safe: relation === "duplicate" ? ["a", "b"] : relation === "subsumed" ? ["b"] : [], claims: [], why: "because", a: note(`${id}-one`, what), b: note(`${id}-two`, what), ...over };
}

function setup(cases: Case[], embedder: Embedder = "deterministic") {
  const root = mkdtempSync(join(tmpdir(), "consolidate-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  // The folders of the sandboxes this context makes, so a test can ask whether its own are gone, whatever else sits in the shared temp folder.
  const made: string[] = [];
  const newSandbox = () => {
    const sandbox = { ...createSandbox("consolidate-test", sandboxOptions(embedder)), cmd: ["bun", script] };
    made.push(sandbox.dir);
    dirs.push(sandbox.dir); // one that a failing test leaves behind is removed with the rest
    return sandbox;
  };
  process.env.FAKE_COUNTER_DIR = root;
  const ctx = { newSandbox, baseUrl: "http://localhost:1/v1", model: "the-model", hasKey: false, version: "0.9.99-test", label: "t", rateLimitWaitMs: 1, embedder };
  return { ctx, folders: { assets, results: join(root, "results") }, root, made };
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

const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0]);
  const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { dir, rows, summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) };
};

/**
 * The keys of the summary.json that consolidate wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts (with those of RunInputs and
 * CorpusFields it extended), without results_dir, which is returned and not written. The website, scripts/ledger and scripts/compare read them, so none may go. A run
 * adds concurrency and timeout_ms to them.
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "status", "aborted_reason", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "embedder", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "n_paired", "served_models", "metrics", "model_calls", "semantic_verification", "manifest"];

/** The same for `--pool`: the PoolSummary interface in the committed run.ts (with RunInputs), without results_dir. `error` is there only when the run failed. The pool is one run, so it has no `concurrency`. */
const POOL_KEYS = ["eval", "mode", "corpus", "corpus_folder", "label", "date", "status", "aborted_reason", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "embedder", "strategy", "config_patch", "timeout_ms", "limit", "n_notes", "n_clusters", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "n_paired", "seconds", "served_models", "metrics", "model_calls", "semantic_verification", "manifest", "config", "engine", "assets_sha256", "seed"];

describe("writeNotes", () => {
  const day = 86_400_000;
  const daysOld = (sandbox: { dir: string }, name: string) => Math.round((Date.now() - statSync(join(sandbox.dir, "bundle", "memories", `${name}.md`)).mtimeMs) / day);

  test("puts the notes in the bundle as memories, dated by file time: the older 3 days ago, the newer 1, a pair from one day 2 each", () => {
    for (const [older, a, b] of [["a", 3, 1], ["b", 1, 3], [null, 2, 2]] as const) {
      const sandbox = createSandbox("consolidate-test");
      try {
        const c = mk("d1", "duplicate", "keep", { older });
        writeNotes(sandbox, c);
        expect(readFileSync(join(sandbox.dir, "bundle", "memories", "d1-one.md"), "utf8")).toBe(c.a.text);
        expect(readFileSync(join(sandbox.dir, "bundle", "memories", "d1-two.md"), "utf8")).toBe(c.b.text);
        expect([daysOld(sandbox, "d1-one"), daysOld(sandbox, "d1-two")]).toEqual([a, b]);
      } finally {
        removeSandbox(sandbox);
      }
    }
  });
});

describe("failureHint", () => {
  test("is the first line akm printed that reads as a failure, and nothing when there is none", () => {
    expect(failureHint("[consolidate] chunk 1/1\nNetwork error: Unable to connect.\nWarning: x\n  consolidate  m  2  2")).toBe(" (akm said: Network error: Unable to connect.)");
    expect(failureHint("[improve] usage report\n  process  failures\nWarning: show events not yet in usage_events")).toBe("");
    expect(failureHint("")).toBe("");
  });
});

describe("runCorpus", () => {
  test("reads each pair's retirement back by side, and scores it against the case", async () => {
    const { ctx, folders } = setup([
      mk("d1", "duplicate", "retire-older"),
      mk("d2", "duplicate", "retire-older", { older: "b" }),
      mk("s1", "subsumed", "retire-newer"),
      mk("o1", "overlap", "retire-older"),
      mk("o2", "overlap", "keep"),
      mk("u1", "unrelated", "unpaired"),
      mk("c1", "contradicts", "promote", { older: null }),
      mk("e1", "supersedes", "no-verdict", { safe: ["a"] }),
      mk("e2", "supersedes", "crash", { safe: ["a"] }),
    ]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(summary).toMatchObject({ eval: "consolidate", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 9, n_run: 9, n_scored: 7, n_errored: 2, timeouts: 0, n_paired: 6, status: "complete", aborted_reason: null });
    // the endpoint's names add up over every case that got as far as a run result, errored ones included: 8 cases of 2 calls
    expect(summary.served_models).toEqual({ "fake-served": 16 });
    expect(summary.metrics.unsafe).toEqual({ n: 1, of: 7, staged: 1 });
    expect(summary.metrics.precision).toEqual({ value: 0.75, safe: 3, retired: 4 });
    expect(summary.metrics.recall).toEqual({ value: 1, retired_safe: 3, of: 3 });
    expect(summary.metrics.classes.overlap).toMatchObject({ n: 2, retired_unsafe: 1, kept: 1 });
    expect(summary.metrics.classes.unrelated).toMatchObject({ n: 1, paired: 0, kept: 1 });
    expect(summary.metrics.classes.supersedes).toMatchObject({ n: 2, error: 2 });

    const { dir, rows } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")).results_dir).toBeUndefined();
    const byId = (id: string) => rows.find((r) => r.id === id);
    // d1: the older note is a, and akm retired it. d2: the older note is b.
    expect(byId("d1")).toMatchObject({ outcome: "retire", retired: "a", safe: true, staged: true, judged_as: "duplicate", reason: "same claims", only_in_retired: [], only_in_successor: ["a kept claim"] });
    expect(byId("d2")).toMatchObject({ outcome: "retire", retired: "b", safe: true });
    // s1: the newer note is b, and it is the subset
    expect(byId("s1")).toMatchObject({ retired: "b", safe: true, staged: false, judged_as: "subsumed" });
    expect(byId("o1")).toMatchObject({ retired: "a", safe: false });
    expect(byId("o2")).toMatchObject({ outcome: "keep", paired: true, judged_as: "overlap" });
    expect(byId("u1")).toMatchObject({ outcome: "keep", paired: false, judged_as: null });
    expect(byId("c1")).toMatchObject({ outcome: "keep", paired: true });
    expect(byId("e1")).toMatchObject({ outcome: "error", error: "akm paired the notes but its judge gave no verdict (akm said: Network error: Unable to connect. Is the computer able to access the url?)" });
    expect(byId("e2").error).toContain("boom");
    expect(byId("e2").error).toContain("exit 70");
  });

  test("runs the strategy it is given, and records it with the config patch's path and SHA-256", async () => {
    process.env.FAKE_STRATEGY = "lab-strategy";
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
      const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, overrides: { strategy: "lab-strategy", configPatch: { path: "patches/p.json", sha256: "abc123", patch: {} } } }, folders.results));
      expect(summary).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
      expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
    } finally {
      delete process.env.FAKE_STRATEGY;
    }
  });

  test("without the flags it runs its own strategy and records no patch", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    expect(await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results))).toMatchObject({ strategy: "consolidate", config_patch: null });
  });

  test("gives akm what it needs: semantic search, the deterministic embedder, and notes dated by file time", async () => {
    // the fake fails the index step without the embedder or with semantic search off, and the older note is the one with the older mtime
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(summary.n_errored).toBe(0);
    expect(resultsOf(folders).rows[0]).toMatchObject({ retired: "a" });
  });

  test("removes every sandbox it makes", async () => {
    const { ctx, folders, made } = setup([mk("d1", "duplicate", "retire-older"), mk("e", "overlap", "crash")]);
    await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(made.length).toBeGreaterThan(0);
    expect(made.filter((dir) => existsSync(dir))).toEqual([]);
  });

  test("a limit takes the first case of each relation in turn", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("d2", "duplicate", "retire-older"), mk("s1", "subsumed", "retire-newer"), mk("o1", "overlap", "keep")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, limit: 3 }, folders.results));
    expect(summary).toMatchObject({ limit: 3, n_cases: 4, n_run: 3 });
    expect(resultsOf(folders).rows.map((r) => r.id)).toEqual(["d1", "s1", "o1"]);
  });

  test("tries a rate limited case again after a wait, and says how many tries it took", async () => {
    const { ctx, folders } = setup([mk("l1", "duplicate", "limited-2"), mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(summary).toMatchObject({ n_run: 2, n_scored: 2, n_errored: 0 });
    const { rows } = resultsOf(folders);
    expect(rows[0]).toMatchObject({ id: "l1", outcome: "retire", retired: "a", safe: true, retried: 2 });
    expect(rows[1].retried).toBeUndefined();
  });

  test("a case still rate limited after the new tries is an errored row that says how many tries it took, and the run goes on", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("l1", "duplicate", "limited-99"), mk("d2", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(summary).toMatchObject({ n_run: 3, n_scored: 2, n_errored: 1, status: "complete", aborted_reason: null });
    const { rows } = resultsOf(folders);
    expect(rows.map((r) => r.id)).toEqual(["d1", "l1", "d2"]);
    expect(rows[1]).toMatchObject({ outcome: "error", retried: 4 });
    expect(rows[1].error).toContain("429");
  });

  test("an endpoint that keeps rate limiting is the run's five errored cases in a row, with the 429 in the reason, not a stop of its own", async () => {
    const { ctx, folders } = setup(Array.from({ length: 7 }, (_, i) => mk(`l${i}`, "duplicate", "limited-99")));
    await expect(quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results))).rejects.toThrow("5 cases in a row errored, so the run stopped after 5 of 7");
    const { rows, summary } = resultsOf(folders);
    expect(rows.map((r) => r.retried)).toEqual([4, 4, 4, 4, 4]); // each was tried again four times first
    expect(summary).toMatchObject({ status: "aborted", n_run: 5, n_scored: 0, n_errored: 5, n_cases: 7 });
    expect(summary.aborted_reason).toContain("429");
  });

  test("keeps the endpoint out of an error, in the row and on the console", async () => {
    const { ctx, folders } = setup([mk("l1", "overlap", "leaky"), mk("l2", "overlap", "leaky-crash")]);
    const shown: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void shown.push(a.join(" "));
    await runCorpus(publicCorpus(folders.assets), ctx, folders.results).finally(() => (console.log = log));
    const { rows } = resultsOf(folders);
    expect(rows[0].error).toBe("akm paired the notes but its judge gave no verdict (akm said: LLM request failed: <MODEL_BASE_URL>/chat/completions refused)");
    expect(rows[1].error).toContain("<MODEL_BASE_URL>/chat/completions refused");
    expect(JSON.stringify(rows)).not.toContain("localhost:1");
    expect(shown.join("\n")).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(shown.join("\n")).not.toContain("localhost:1");
  });

  test("does not try a case again for any other error", async () => {
    const { ctx, folders } = setup([mk("e1", "overlap", "crash"), mk("d1", "duplicate", "retire-older")]);
    await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(resultsOf(folders).rows[0].retried).toBeUndefined();
  });

  test("says so when akm paired none of the notes, with what to look at in the reason, and marks the summary it wrote before that as aborted", async () => {
    const { ctx, folders } = setup([mk("u1", "unrelated", "unpaired"), mk("u2", "unrelated", "unpaired")]);
    await expect(quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results))).rejects.toThrow("akm paired none of the notes");
    const { summary } = resultsOf(folders);
    expect(summary).toMatchObject({ n_paired: 0, n_run: 2, status: "aborted" });
    expect(summary.aborted_reason).toBe("akm paired none of the notes, so its judge never ran. Consolidate needs semantic search, which this eval gets from akm's deterministic embedder (AKM_EMBED_DETERMINISTIC). Does this akm still have it?");
  });

  test("a run that ends without a failure is complete, even with a limit that cuts the cases short", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("s1", "subsumed", "retire-newer")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, limit: 1 }, folders.results));
    expect(summary).toMatchObject({ n_run: 1, n_cases: 2, status: "complete", aborted_reason: null });
  });

  test("an akm that retires a note outside the pair is an error, not a retirement", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("x1", "duplicate", "retire-outsider")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(summary).toMatchObject({ n_scored: 1, n_errored: 1 });
    expect(resultsOf(folders).rows[1].error).toContain("not one of the two notes");
  });

  test("counts the cases in which it killed akm for running too long as timeouts, apart from the other errors", async () => {
    const { ctx, folders } = setup([mk("t1", "overlap", "slow-improve"), mk("t2", "overlap", "slow-index"), mk("e1", "overlap", "crash"), mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, timeoutMs: 1500 }, folders.results));
    expect(summary).toMatchObject({ n_run: 4, n_scored: 1, n_errored: 3, timeouts: 2, status: "complete" });
    const { rows, summary: stored } = resultsOf(folders);
    expect(stored).toMatchObject({ n_errored: 3, timeouts: 2 });
    expect(rows[0]).toMatchObject({ id: "t1", outcome: "error", error: "akm improve timed out after 1.5s", timed_out: true });
    expect(rows[1]).toMatchObject({ id: "t2", outcome: "error", error: "akm index timed out after 1.5s", timed_out: true });
    expect(rows[2].error).toContain("boom");
    expect(rows[2]).not.toHaveProperty("timed_out");
    expect(rows[3]).toMatchObject({ outcome: "retire" });
    expect(rows[3]).not.toHaveProperty("timed_out");
  });

  test("a timeout is not a rate limit: the case is not tried again", async () => {
    const { ctx, folders } = setup([mk("t1", "overlap", "slow-improve"), mk("d1", "duplicate", "retire-older")]);
    await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, timeoutMs: 1500 }, folders.results));
    expect(resultsOf(folders).rows[0].retried).toBeUndefined();
  });

  test("writes a sound manifest: the parts it ran with, the digests of its cases, and which cases were scored", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("e1", "overlap", "crash"), mk("o1", "overlap", "keep")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, hasKey: true }, folders.results));
    const stored = resultsOf(folders).summary;
    expect(manifestProblems(stored.manifest)).toEqual([]);
    expect(readManifest(stored).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    const m = summary.manifest;
    expect(m).toMatchObject({ eval: "consolidate", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, eval_settings: { embedder: "deterministic" } });
    expect(m.akm).toEqual({ version: "0.9.99-test", bin: stored.akm_bin, build: null, build_fingerprint: null });
    expect(m.settings).toEqual({ strategy: "consolidate", config_patch_sha256: null, timeout_ms: 1_800_000, seed: null }); // the effective timeout of improve: it used to be recorded as null
    expect(Object.keys(m.cases)).toEqual(["d1", "e1", "o1"]);
    expect(m.completion).toEqual({ selected: ["d1", "e1", "o1"], scored: ["d1", "o1"], errored: ["e1"] });
    expect(m.engines.consolidate).toMatchObject({ model: "the-model", temperature: 0, enableThinking: false });
    expect(JSON.stringify(m)).not.toContain("localhost:1/"); // the manifest holds the host and the digest of the endpoint identity, and this endpoint has a path
    // two runs of the same cases give the same digests; another note gives another input digest and the same label digest
    const other = setup([mk("d1", "duplicate", "retire-older", { a: note("d1-one", "retire-older and more") }), mk("e1", "overlap", "crash"), mk("o1", "overlap", "keep")]);
    const second = await quiet(() => runCorpus(publicCorpus(other.folders.assets), other.ctx, other.folders.results));
    expect(second.manifest.cases.d1.input_sha256).not.toBe(m.cases.d1.input_sha256);
    expect(second.manifest.cases.d1.label_sha256).toBe(m.cases.d1.label_sha256);
    expect(second.manifest.cases.e1).toEqual(m.cases.e1);
  });

  test("the embedder is in the summary, deterministic by default and real with the real embedder", async () => {
    const hash = setup([mk("d1", "duplicate", "retire-older")]);
    expect((await quiet(() => runCorpus(publicCorpus(hash.folders.assets), hash.ctx, hash.folders.results))).embedder).toBe("deterministic");
    process.env.FAKE_EMBEDDER = "real";
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")], "real");
      const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
      expect(summary.embedder).toBe("real");
      expect(resultsOf(folders).summary.embedder).toBe("real");
      expect(resultsOf(folders).summary.manifest.eval_settings).toEqual({ embedder: "real" }); // scripts/compare shows it beside the strategy
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("the rows it writes hold the raw output, so scripts/rescore scores the run again without akm", async () => {
    // the first cases of the public corpus, which the fake akm sees no instruction in: it pairs none of them
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    const publicFolder = join(ROOT, "evals", "consolidate", "assets");
    const summary = await quiet(() => runCorpus(publicCorpus(publicFolder), { ...ctx, limit: 6 }, folders.results)).catch((e: Error) => e);
    const { dir, rows } = resultsOf(folders);
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row).toHaveProperty("pair_pass");
    expect(rows.every((r) => Array.isArray(r.retire_proposals) && Array.isArray(r.usage))).toBe(true);
    void summary; // the fake akm pairs nothing here, so the run is "aborted"; its rows are still a stored run
    clearRunning(dir); // the run ended in this process, which is where the marker is removed
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(readFileSync(join(out, "samples.jsonl"), "utf8")).toBe(readFileSync(join(dir, "samples.jsonl"), "utf8"));
    rmSync(out, { recursive: true, force: true });
  });

  test("records the config it wrote with the secrets and the endpoint left out, the engine's settings, the digest of the cases, and no seed for the public cases", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, hasKey: true }, folders.results));
    const { summary } = resultsOf(folders);
    expect(summary).toMatchObject({ status: "complete", aborted_reason: null, embedder: "deterministic", seed: null, timeouts: 0 });
    expect(summary.assets_sha256).toBe(assetsDigest(folders.assets, INPUT_FILES));
    expect(summary.engine).toEqual({ engine: "consolidate", model: "the-model", endpoint: endpointHost("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { consolidate: { model: "the-model", endpoint: endpointHost("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
    expect(summary.config.engines.consolidate).toMatchObject({ kind: "llm", model: "the-model", endpoint: "<MODEL_BASE_URL>/chat/completions", apiKey: "$MODEL_API_KEY", temperature: 0, enableThinking: false });
    expect(summary.config).toMatchObject({ semanticSearchMode: "auto", defaults: { llmEngine: "consolidate" } });
    expect(summary.config.embedding).toBeUndefined();
    expect(JSON.stringify(summary.config)).not.toContain("localhost:1/v1"); // the config hides the endpoint; engine records its host
    expect(summary.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
  });

  test("the digest of the cases follows the cases, and the config follows the config patch", async () => {
    const [x, y] = [setup([mk("d1", "duplicate", "retire-older")]), setup([mk("d1", "duplicate", "retire-newer")])];
    const overrides = { strategy: "consolidate", configPatch: { path: "p.json", sha256: "abc", patch: { engines: { consolidate: { temperature: 0.3 } } } } };
    await quiet(() => runCorpus(publicCorpus(x.folders.assets), { ...x.ctx, overrides }, x.folders.results));
    await quiet(() => runCorpus(publicCorpus(y.folders.assets), y.ctx, y.folders.results));
    const [a, b] = [resultsOf(x.folders).summary, resultsOf(y.folders).summary];
    expect(a.assets_sha256).not.toBe(b.assets_sha256);
    expect(a.engine.temperature).toBe(0.3);
    expect(a.config.engines.consolidate.temperature).toBe(0.3);
    expect(b.engine.temperature).toBe(0);
  });

  test("a custom run records, for a rewrite, its seed; the public run and your own cases have none", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    const custom = (rewrite: boolean, seed: string | null): ResolvedCorpus => ({ name: "custom", folder: folders.assets, rewrite, seed, flag: "--corpus custom" });
    const publicRun = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    expect(publicRun).toMatchObject({ corpus: "public", seed: null });
    const rewrite = await quiet(() => runCorpus(custom(true, "777"), { ...ctx, label: "t2" }, folders.results));
    expect(rewrite).toMatchObject({ corpus: "custom", seed: "777" });
    expect(rewrite.manifest).toMatchObject({ corpus: "custom", settings: { seed: "777" } });
    expect(JSON.parse(readFileSync(join(rewrite.results_dir, "summary.json"), "utf8")).seed).toBe("777");
    const own = await quiet(() => runCorpus(custom(false, null), { ...ctx, label: "t3" }, folders.results));
    expect(own).toMatchObject({ corpus: "custom", seed: null });
    expect(own.assets_sha256).toBe(assetsDigest(folders.assets, INPUT_FILES));
  });

  test("with the real embedder it sets akm's model in the config and no switch for the hash one, and records it", async () => {
    process.env.FAKE_EMBEDDER = "real"; // the fake refuses to index without the model's folder, the model in the config, and with the switch on
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")], "real");
      const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
      expect(summary).toMatchObject({ embedder: "real", n_errored: 0, status: "complete" });
      expect((summary.config as any).embedding.localModel).toBe("Xenova/bge-small-en-v1.5");
      expect(resultsOf(folders).summary.embedder).toBe("real");
      expect(resultsOf(folders).rows[0]).toMatchObject({ outcome: "retire", retired: "a" });
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("--semantic, as the driver parses it, runs the real embedder with the config patch recorded, and the config it wrote is the one --embedder real wrote", async () => {
    process.env.FAKE_EMBEDDER = "real";
    try {
      const a = setup([mk("d1", "duplicate", "retire-older")], "real");
      const b = setup([mk("d1", "duplicate", "retire-older")], "real");
      const overrides = parseOverrides({ semantic: true }, "consolidate", fail);
      const [plain, semantic] = [await quiet(() => runCorpus(publicCorpus(a.folders.assets), a.ctx, a.folders.results)), await quiet(() => runCorpus(publicCorpus(b.folders.assets), { ...b.ctx, overrides }, b.folders.results))];
      expect(JSON.stringify(semantic.config)).toBe(JSON.stringify(plain.config)); // the same keys, in the same order
      expect(semantic).toMatchObject({ embedder: "real", n_errored: 0, config_patch: { path: "--semantic" } });
      expect(plain.config_patch).toBeNull();
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("a real embedding config prepares the shared model cache in an initially plain sandbox", async () => {
    process.env.FAKE_EMBEDDER = "real";
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")], "deterministic"); // writeConfig prepares the model cache
      const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, embedder: "real" }, folders.results));
      expect(summary.n_errored).toBe(0);
      expect(summary.embedder).toBe("real");
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("with the real embedder, a run in which akm pairs nothing points at the run without --semantic", async () => {
    process.env.FAKE_EMBEDDER = "real";
    try {
      const { ctx, folders } = setup([mk("u1", "unrelated", "unpaired")], "real");
      await expect(quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results))).rejects.toThrow("Try again without --semantic");
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("the summary has every key it has always had, which the website, scripts/ledger and scripts/compare read, and concurrency and timeout_ms besides", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("o1", "overlap", "keep")]);
    const summary = await quiet(() => runCorpus(publicCorpus(folders.assets), ctx, folders.results));
    const stored = resultsOf(folders).summary;
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms"].sort());
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(stored), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(stored).toMatchObject({ concurrency: 1, timeout_ms: 1_800_000, embedder: "deterministic", strategy: "consolidate" });
  });

  test("gives the engine the provider kind of the context, in the config akm reads and in the summary, and openai without one", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    const other = await quiet(() => runCorpus(publicCorpus(folders.assets), { ...ctx, provider: "groq", label: "groq" }, folders.results));
    expect((other.config as any).engines.consolidate.provider).toBe("groq");
    const plain = setup([mk("d1", "duplicate", "retire-older")]);
    expect(((await quiet(() => runCorpus(publicCorpus(plain.folders.assets), plain.ctx, plain.folders.results))).config as any).engines.consolidate.provider).toBe("openai");
  });

  test("runs the pairs --concurrency at a time, each in a sandbox of its own, and the rows and the summary are those of one at a time", async () => {
    const specs = [mk("d1", "duplicate", "retire-older"), mk("d2", "duplicate", "retire-older", { older: "b" }), mk("s1", "subsumed", "retire-newer"), mk("o1", "overlap", "keep"), mk("e1", "overlap", "crash")];
    const [serial, pooled] = [setup(specs), setup(specs)];
    const a = await quiet(() => runCorpus(publicCorpus(serial.folders.assets), serial.ctx, serial.folders.results));
    const b = await quiet(() => runCorpus(publicCorpus(pooled.folders.assets), { ...pooled.ctx, concurrency: 3 }, pooled.folders.results));
    const bare = (rows: any[]) => rows.map(({ seconds: _s, ...rest }) => rest).sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(bare(resultsOf(pooled.folders).rows)).toEqual(bare(resultsOf(serial.folders).rows));
    expect([a.concurrency, b.concurrency]).toEqual([1, 3]);
    expect([b.n_run, b.n_scored, b.n_errored, b.n_paired]).toEqual([a.n_run, a.n_scored, a.n_errored, a.n_paired]);
    expect(pooled.made.length).toBe(5);
    expect(pooled.made.filter((dir) => existsSync(dir))).toEqual([]);
  });
});

describe("the command", () => {
  // Bun loads the .env of its working folder, and the repository's holds the model settings. So the command runs in a folder of its
  // own and with an akm that does not exist, and never reaches a model, whatever .env says.
  const run = (args: string[], env: Record<string, string> = {}) => {
    const { MODEL_BASE_URL: _u, MODEL_NAME: _m, AKM_BIN: _a, ...rest } = process.env;
    const cwd = mkdtempSync(join(tmpdir(), "consolidate-run-"));
    dirs.push(cwd);
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { cwd, env: { ...rest, AKM_BIN: "no-such-akm-in-this-test", ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };
  const model = { MODEL_BASE_URL: "http://localhost:1/v1", MODEL_NAME: "the-model" };
  const noAkm = "could not run `no-such-akm-in-this-test --version`";

  test("--embedder is gone: --semantic selects akm's real embedder, and without it the notes are embedded by the deterministic one", () => {
    for (const args of [["--embedder", "real"], ["--pool", "--embedder", "deterministic"]]) {
      const done = run(args, model);
      expect([done.code, done.err]).toEqual([2, expect.stringContaining("Unknown option '--embedder'")]);
    }
    for (const args of [["--semantic"], ["--pool", "--semantic"], []]) expect(run(args, model).err).toContain(noAkm); // each goes on to the akm check
    const help = run(["--help"]).out;
    expect(help).not.toMatch(/--embedder|--yes/);
    expect(help).toContain("Without --semantic that is akm's deterministic word-hash embedder");
    expect(help).toMatch(/--semantic +enable native/);
  });

  test("--timeout-ms and --concurrency are flags of the run on pairs, and --pool takes --timeout-ms and no --concurrency", () => {
    expect(run(["--timeout-ms", "60000", "--concurrency", "2"], model).err).toContain(noAkm);
    expect(run(["--pool", "--timeout-ms", "60000"], model).err).toContain(noAkm);
    const pool = run(["--pool", "--concurrency", "2"], model);
    expect([pool.code, pool.err]).toEqual([2, expect.stringContaining("Unknown option '--concurrency'")]);
    for (const bad of ["0", "x"]) expect(run(["--timeout-ms", bad], model).err).toContain("--timeout-ms must be a positive integer");
  });

  test("--pool has a usage of its own, where --timeout-ms is akm's budget, and the usage of the run on pairs says it is there", () => {
    const pairs = run(["--help"]).out;
    expect(pairs).toContain("[--pool]");
    expect(pairs).toMatch(/--pool +one sandbox with the whole pool/);
    expect(pairs).toContain("--concurrency");
    expect(pairs).toContain("Default: 1800000.");
    const pool = run(["--pool", "--help"]).out;
    expect(pool).toContain("Runs akm's consolidate on the whole public pool");
    expect(pool).toMatch(/--timeout-ms is akm's own wall-clock budget/);
    expect(pool).toContain("Default: 7200000.");
    expect(pool).toContain("Without --label the results folder is named <UTC date>-<model name>-pool.");
    expect(pool).not.toContain("--concurrency");
    expect(pool).toContain("Default: <model name>-pool.");
    expect(pool).toContain("  --timeout-ms   akm improve's own wall-clock budget");
    expect(pool).not.toMatch(/--embedder|--yes/);
    for (const help of [pairs, pool]) expect(help).toEndWith(`\n${PROBE_NOTE}\n`);
  });

  test("--pool runs the public pool: it refuses a custom corpus of your own and --limit, before akm is asked anything", () => {
    const notes = mkdtempSync(join(tmpdir(), "consolidate notes-"));
    dirs.push(notes);
    writeFileSync(join(notes, "cases.jsonl"), readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl")));
    for (const args of [["--pool", "--cases", notes], ["--pool", "--limit", "3"]]) {
      const done = run(args, model);
      expect([args.join(" "), done.code]).toEqual([args.join(" "), 2]);
      expect(done.err).toContain("consolidate: --pool runs the public pool: leave out --corpus custom, --corpus all, --cases and --limit");
      expect(done.err).not.toContain("could not run");
    }
  });

  test("a custom folder of your own goes on to the akm check", () => {
    const notes = mkdtempSync(join(tmpdir(), "consolidate notes-"));
    dirs.push(notes);
    writeFileSync(join(notes, "cases.jsonl"), readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl")));
    expect(run(["--cases", notes], model).err).toContain(noAkm);
  });
});

describe("the command with an akm that answers", () => {
  const REPO = join(import.meta.dir, "..", "..", "..");
  const EVAL = join(REPO, "evals", "consolidate");

  /** A copy of the code in a temp folder, so that a custom run writes its results to its private/ and never to the repository's, and a fake akm that logs what it is asked. */
  function copyOfRepo() {
    const tree = mkdtempSync(join(tmpdir(), "consolidate tree-"));
    dirs.push(tree);
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "src"), join(tree, "evals", "consolidate", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "assets", "pool"), join(tree, "evals", "consolidate", "assets", "pool"), { recursive: true });
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const exec = (args: string[]) => {
      const log = join(tree, `calls-${args.join("-").replace(/[^a-z0-9]+/gi, "_")}.jsonl`);
      const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "", AKM_EVAL_NO_PROBE: "1", AKM_BIN: commandLine(["bun", script]), FAKE_COMMANDS_LOG: log, FAKE_COUNTER_DIR: tree }; // nothing listens on port 9, and the run is not to ask it
      const p = Bun.spawnSync(["bun", join(tree, "evals", "consolidate", "src", "run.ts"), ...args], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
      const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
      return { code: p.exitCode, err: p.stderr.toString(), out: p.stdout.toString(), calls };
    };
    const stored = (parent: string, label: string) => {
      const results = join(tree, parent);
      const folder = join(results, readdirSync(results).find((name) => name.endsWith(`-${label}`)) as string);
      return { folder, summary: JSON.parse(readFileSync(join(folder, "summary.json"), "utf8")), rows: readFileSync(join(folder, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
    };
    return { tree, exec, stored };
  }

  test("--concurrency and --timeout-ms reach the run on pairs through consolidate's flags: every pair has its row, akm is probed once, and both are recorded", () => {
    const { tree, exec, stored } = copyOfRepo();
    const notes = join(tree, "notes");
    mkdirSync(notes);
    writeFileSync(join(notes, "cases.jsonl"), `${[mk("d1", "duplicate", "retire-older"), mk("d2", "duplicate", "retire-older"), mk("s1", "subsumed", "retire-newer"), mk("o1", "overlap", "keep")].map((c) => JSON.stringify(c)).join("\n")}\n`);
    const done = exec(["--cases", notes, "--concurrency", "3", "--timeout-ms", "20000", "--label", "flags"]);
    expect([done.code, done.err]).toEqual([0, ""]);
    const { summary, rows } = stored(join("private", "consolidate", "results"), "flags");
    expect(Object.keys(summary).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    expect(summary).toMatchObject({ concurrency: 3, timeout_ms: 20_000, n_run: 4, status: "complete", embedder: "deterministic", corpus: "custom" });
    expect(summary.manifest.settings.timeout_ms).toBe(20_000);
    expect(summary.manifest).toMatchObject({ mode: null, eval_settings: { embedder: "deterministic" } });
    expect(rows.map((r) => r.id).sort()).toEqual(["d1", "d2", "o1", "s1"]);
    expect(done.calls.filter((c) => c.args[0] === "--version")).toHaveLength(1);
    expect(done.calls.filter((c) => c.args[0] === "improve")).toHaveLength(4);
    expect(done.calls.every((c) => c.args[0] === "--version" || c.deterministic === "1")).toBe(true); // the hash embedder's switch is on in every command after the probe
  }, 60_000);

  test("--pool runs the pool as one improve with the strategy: a run without --timeout-ms sends akm none, as it always did, and one with it sends akm the budget", () => {
    const { exec, stored } = copyOfRepo();
    const plain = exec(["--pool", "--label", "plain"]);
    expect([plain.code, plain.err]).toEqual([0, ""]);
    expect(plain.calls.find((c) => c.args[0] === "improve")?.args).toEqual(["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json"]);
    const { folder, summary, rows } = stored(join("evals", "consolidate", "results"), "plain");
    expect(Object.keys(summary).sort()).toEqual([...POOL_KEYS, "wall_seconds"].sort());
    expect(summary).toMatchObject({ mode: "pool", corpus: "public", corpus_folder: null, n_cases: 1, n_run: 1, n_scored: 1, n_notes: 80, n_clusters: 47, strategy: "consolidate", embedder: "deterministic", limit: null, timeout_ms: 7_200_000, status: "complete" });
    expect(summary.manifest).toMatchObject({ mode: "pool", eval_settings: { embedder: "deterministic" } });
    expect(rows).toHaveLength(47);
    expect(readdirSync(folder).filter((name) => name !== ".running").sort()).toEqual(["improve.json", "samples.jsonl", "summary.json"]); // akm's result of the improve run is kept beside the rows
    expect(JSON.parse(readFileSync(join(folder, "improve.json"), "utf8"))).toMatchObject({ ok: true, strategy: "consolidate" });

    const budget = exec(["--pool", "--timeout-ms", "123000", "--label", "budget"]);
    expect(budget.code).toBe(0);
    expect(budget.calls.find((c) => c.args[0] === "improve")?.args).toEqual(["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json", "--timeout-ms", "123000"]);
    expect(stored(join("evals", "consolidate", "results"), "budget").summary).toMatchObject({ timeout_ms: 123_000, manifest: { settings: { timeout_ms: 123_000 } } });
  }, 60_000);

  test("--pool without --label names its folder for the model and -pool, the run on pairs for the model alone, and --label names either", () => {
    const { tree, exec, stored } = copyOfRepo();
    const notes = join(tree, "notes");
    mkdirSync(notes);
    writeFileSync(join(notes, "cases.jsonl"), `${JSON.stringify(mk("d1", "duplicate", "retire-older"))}\n`);
    for (const args of [["--pool"], ["--pool", "--label", "mine"], ["--cases", notes], ["--cases", notes, "--label", "mine"]]) expect([args, exec(args).code]).toEqual([args, 0]); // the model is m
    const day = new Date().toISOString().slice(0, 10);
    expect(readdirSync(join(tree, "evals", "consolidate", "results")).sort()).toEqual([`${day}-m-pool`, `${day}-mine`]);
    expect(readdirSync(join(tree, "private", "consolidate", "results")).sort()).toEqual([`${day}-m`, `${day}-mine`]);
    expect(stored(join("evals", "consolidate", "results"), "m-pool").summary).toMatchObject({ mode: "pool", label: "m-pool" });
    expect(stored(join("evals", "consolidate", "results"), "mine").summary.label).toBe("mine");
    expect(stored(join("private", "consolidate", "results"), "m").summary.label).toBe("m");
  }, 60_000);
});
