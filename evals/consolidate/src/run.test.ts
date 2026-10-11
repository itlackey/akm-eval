import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { GENERATED, assetsDigest } from "./inputs.ts";
import { type Case, type Embedder, INPUT_FILES, type Relation, sandboxOptions } from "./lib.ts";
import { failureHint, runCorpus, writeNotes } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that consolidates by a word in the notes: "FAKE: <what>" in either note says what the pair pass does with them. It
 * needs what the real one needs, the deterministic embedder and semantic search, and it picks the older note by file time.
 */
const FAKE_AKM = `
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const cmd = args[0];
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
  json({ ok: true, totalEntries: notes.length });
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
    const summary = await quiet(() => runCorpus("public", ctx, folders));
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
      const summary = await quiet(() => runCorpus("public", { ...ctx, overrides: { strategy: "lab-strategy", configPatch: { path: "patches/p.json", sha256: "abc123", patch: {} } } }, folders));
      expect(summary).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
      expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
    } finally {
      delete process.env.FAKE_STRATEGY;
    }
  });

  test("without the flags it runs its own strategy and records no patch", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    expect(await quiet(() => runCorpus("public", ctx, folders))).toMatchObject({ strategy: "consolidate", config_patch: null });
  });

  test("gives akm what it needs: semantic search, the deterministic embedder, and notes dated by file time", async () => {
    // the fake fails the index step without the embedder or with semantic search off, and the older note is the one with the older mtime
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary.n_errored).toBe(0);
    expect(resultsOf(folders).rows[0]).toMatchObject({ retired: "a" });
  });

  test("removes every sandbox it makes", async () => {
    const { ctx, folders, made } = setup([mk("d1", "duplicate", "retire-older"), mk("e", "overlap", "crash")]);
    await quiet(() => runCorpus("public", ctx, folders));
    expect(made.length).toBeGreaterThan(0);
    expect(made.filter((dir) => existsSync(dir))).toEqual([]);
  });

  test("a limit takes the first case of each relation in turn", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("d2", "duplicate", "retire-older"), mk("s1", "subsumed", "retire-newer"), mk("o1", "overlap", "keep")]);
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 3 }, folders));
    expect(summary).toMatchObject({ limit: 3, n_cases: 4, n_run: 3 });
    expect(resultsOf(folders).rows.map((r) => r.id)).toEqual(["d1", "s1", "o1"]);
  });

  test("tries a rate limited case again after a wait, and says how many tries it took", async () => {
    const { ctx, folders } = setup([mk("l1", "duplicate", "limited-2"), mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary).toMatchObject({ n_run: 2, n_scored: 2, n_errored: 0 });
    const { rows } = resultsOf(folders);
    expect(rows[0]).toMatchObject({ id: "l1", outcome: "retire", retired: "a", safe: true, retried: 2 });
    expect(rows[1].retried).toBeUndefined();
  });

  test("stops the run when the endpoint is still rate limiting after the new tries", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("l1", "duplicate", "limited-99"), mk("d2", "duplicate", "retire-older")]);
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("still rate limiting after 4 new tries of a case, so the run stopped after 2 of 3 cases");
    const { rows, summary } = resultsOf(folders);
    expect(rows.map((r) => r.id)).toEqual(["d1", "l1"]);
    expect(rows[1]).toMatchObject({ outcome: "error", retried: 4 });
    expect(rows[1].error).toContain("429");
    expect(summary).toMatchObject({ n_run: 2, n_scored: 1, n_errored: 1 });
    // the summary on disk says the run was cut short, so it is not taken for a whole one
    expect(summary).toMatchObject({ status: "aborted", n_cases: 3 });
    expect(summary.aborted_reason).toContain("still rate limiting after 4 new tries of a case, so the run stopped after 2 of 3 cases");
    expect(summary.aborted_reason).toContain("429");
  });

  test("keeps the endpoint out of an error, in the row and on the console", async () => {
    const { ctx, folders } = setup([mk("l1", "overlap", "leaky"), mk("l2", "overlap", "leaky-crash")]);
    const shown: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void shown.push(a.join(" "));
    await runCorpus("public", ctx, folders).finally(() => (console.log = log));
    const { rows } = resultsOf(folders);
    expect(rows[0].error).toBe("akm paired the notes but its judge gave no verdict (akm said: LLM request failed: <MODEL_BASE_URL>/chat/completions refused)");
    expect(rows[1].error).toContain("<MODEL_BASE_URL>/chat/completions refused");
    expect(JSON.stringify(rows)).not.toContain("localhost:1");
    expect(shown.join("\n")).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(shown.join("\n")).not.toContain("localhost:1");
  });

  test("does not try a case again for any other error", async () => {
    const { ctx, folders } = setup([mk("e1", "overlap", "crash"), mk("d1", "duplicate", "retire-older")]);
    await quiet(() => runCorpus("public", ctx, folders));
    expect(resultsOf(folders).rows[0].retried).toBeUndefined();
  });

  test("stops early when no case gets a verdict, and says what to check", async () => {
    const { ctx, folders } = setup(Array.from({ length: 9 }, (_, i) => mk(`e${i}`, "overlap", "crash")));
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("the first 5 cases got no verdict");
    const { summary } = resultsOf(folders);
    expect(summary.n_run).toBe(5);
    expect(summary.n_scored).toBe(0);
    expect(summary.status).toBe("aborted");
    expect(summary.aborted_reason).toContain("the first 5 cases got no verdict, so the run stopped. Last error: ");
    expect(summary.aborted_reason).toContain("boom");
  });

  test("says so when akm paired none of the notes, and marks the summary it wrote before that as aborted", async () => {
    const { ctx, folders } = setup([mk("u1", "unrelated", "unpaired"), mk("u2", "unrelated", "unpaired")]);
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("akm paired none of the notes");
    const { summary } = resultsOf(folders);
    expect(summary).toMatchObject({ n_paired: 0, n_run: 2, status: "aborted", aborted_reason: "akm paired none of the notes, so its judge never ran." });
  });

  test("a run that ends without a failure is complete, even with a limit that cuts the cases short", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("s1", "subsumed", "retire-newer")]);
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 1 }, folders));
    expect(summary).toMatchObject({ n_run: 1, n_cases: 2, status: "complete", aborted_reason: null });
  });

  test("an akm that retires a note outside the pair is an error, not a retirement", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older"), mk("x1", "duplicate", "retire-outsider")]);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary).toMatchObject({ n_scored: 1, n_errored: 1 });
    expect(resultsOf(folders).rows[1].error).toContain("not one of the two notes");
  });

  test("counts the cases in which it killed akm for running too long as timeouts, apart from the other errors", async () => {
    const { ctx, folders } = setup([mk("t1", "overlap", "slow-improve"), mk("t2", "overlap", "slow-index"), mk("e1", "overlap", "crash"), mk("d1", "duplicate", "retire-older")]);
    const summary = await quiet(() => runCorpus("public", { ...ctx, indexTimeoutMs: 1500, improveTimeoutMs: 1500 }, folders));
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
    await quiet(() => runCorpus("public", { ...ctx, improveTimeoutMs: 1500 }, folders));
    expect(resultsOf(folders).rows[0].retried).toBeUndefined();
  });

  test("records the config it wrote with the secrets and the endpoint left out, the engine's settings, the digest of the cases, and no seed for the public cases", async () => {
    const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")]);
    await quiet(() => runCorpus("public", { ...ctx, hasKey: true }, folders));
    const { summary } = resultsOf(folders);
    expect(summary).toMatchObject({ status: "complete", aborted_reason: null, embedder: "deterministic", seed: null, timeouts: 0 });
    expect(summary.assets_sha256).toBe(assetsDigest(folders.assets, INPUT_FILES));
    expect(summary.engine).toEqual({ engine: "consolidate", model: "the-model", endpoint: "localhost:1", temperature: 0, enableThinking: false, timeoutMs: 600_000 });
    expect(summary.config.engines.consolidate).toMatchObject({ kind: "llm", model: "the-model", endpoint: "<MODEL_BASE_URL>/chat/completions", apiKey: "$MODEL_API_KEY", temperature: 0, enableThinking: false });
    expect(summary.config).toMatchObject({ semanticSearchMode: "auto", defaults: { llmEngine: "consolidate" } });
    expect(summary.config.embedding).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain("localhost:1/v1");
    // every key it wrote before is still there
    for (const key of ["eval", "corpus", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "limit", "strategy", "config_patch", "n_cases", "n_run", "n_scored", "n_errored", "n_paired", "served_models", "metrics"]) expect(summary).toHaveProperty(key);
  });

  test("the digest of the cases follows the cases, and the config follows the config patch", async () => {
    const [x, y] = [setup([mk("d1", "duplicate", "retire-older")]), setup([mk("d1", "duplicate", "retire-newer")])];
    const overrides = { strategy: "consolidate", configPatch: { path: "p.json", sha256: "abc", patch: { engines: { consolidate: { temperature: 0.3 } } } } };
    await quiet(() => runCorpus("public", { ...x.ctx, overrides }, x.folders));
    await quiet(() => runCorpus("public", y.ctx, y.folders));
    const [a, b] = [resultsOf(x.folders).summary, resultsOf(y.folders).summary];
    expect(a.assets_sha256).not.toBe(b.assets_sha256);
    expect(a.engine.temperature).toBe(0.3);
    expect(a.config.engines.consolidate.temperature).toBe(0.3);
    expect(b.engine.temperature).toBe(0);
  });

  test("a private run records the seed its assets were made from: generated.json beside them, else private/seed", async () => {
    const { ctx, folders, root } = setup([mk("d1", "duplicate", "retire-older")]);
    const priv = join(root, "private");
    const assets = join(priv, "consolidate", "assets");
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, "cases.jsonl"), readFileSync(join(folders.assets, "cases.jsonl")));
    const private_ = { assets, results: join(priv, "consolidate", "results") };
    expect(await quiet(() => runCorpus("private", ctx, private_))).toMatchObject({ corpus: "private", seed: null });
    writeFileSync(join(priv, "seed"), "12345\n");
    expect(await quiet(() => runCorpus("private", { ...ctx, label: "t2" }, private_))).toMatchObject({ seed: "12345" });
    writeFileSync(join(priv, "consolidate", GENERATED), JSON.stringify({ seed: "777", inputs_sha256: "x" }));
    const last = await quiet(() => runCorpus("private", { ...ctx, label: "t3" }, private_));
    expect(last.seed).toBe("777");
    expect(JSON.parse(readFileSync(join(last.results_dir, "summary.json"), "utf8")).seed).toBe("777");
    expect(last.assets_sha256).toBe(assetsDigest(assets, INPUT_FILES));
  });

  test("with the real embedder it sets akm's model in the config and no switch for the hash one, and records it", async () => {
    process.env.FAKE_EMBEDDER = "real"; // the fake refuses to index without the model's folder, the model in the config, and with the switch on
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")], "real");
      const summary = await quiet(() => runCorpus("public", ctx, folders));
      expect(summary).toMatchObject({ embedder: "real", n_errored: 0, status: "complete" });
      expect(summary.config.embedding.localModel).toBe("Xenova/bge-small-en-v1.5");
      expect(resultsOf(folders).summary.embedder).toBe("real");
      expect(resultsOf(folders).rows[0]).toMatchObject({ outcome: "retire", retired: "a" });
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("the real embedder's config is refused by an akm run with the hash embedder's sandbox, so the two cannot be mixed up", async () => {
    process.env.FAKE_EMBEDDER = "real";
    try {
      const { ctx, folders } = setup([mk("d1", "duplicate", "retire-older")], "deterministic"); // a plain sandbox: no model folder
      const summary = await quiet(() => runCorpus("public", { ...ctx, embedder: "real" }, folders));
      expect(summary.n_errored).toBe(1);
      expect(resultsOf(folders).rows[0].error).toContain("the real embedder is not set up");
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
  });

  test("with the real embedder, a run in which akm pairs nothing points at --embedder deterministic", async () => {
    process.env.FAKE_EMBEDDER = "real";
    try {
      const { ctx, folders } = setup([mk("u1", "unrelated", "unpaired")], "real");
      await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("Try --embedder deterministic");
    } finally {
      delete process.env.FAKE_EMBEDDER;
    }
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

  test("says what is wrong with --embedder, and exits 2", () => {
    expect(run(["--embedder", "fake"], model)).toMatchObject({ code: 2 });
    expect(run(["--embedder", "fake"], model).err).toContain('--embedder must be deterministic or real, not "fake"');
    expect(run(["--pool", "--embedder", ""], model).err).toContain("--embedder must be deterministic or real");
  });

  test("takes --embedder real or deterministic, with the cases or the pool, and goes on to the akm check", () => {
    for (const args of [["--embedder", "real"], ["--embedder", "deterministic"], ["--pool", "--embedder", "real"]]) {
      expect(run(args, model).err).toContain("could not run `no-such-akm-in-this-test --version`");
    }
  });

  test("lists --embedder in its usage", () => {
    expect(run(["--help"]).out).toMatch(/--embedder[\s\S]*deterministic[\s\S]*real[\s\S]*--strategy/);
    expect(run(["--help"]).out).toContain("made from other public cases");
  });
});
