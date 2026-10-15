import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine, createSandbox, parseCommand, writeConfig } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { sha256File, sha256Json, sha256Text } from "../../../lib/provenance.ts";
import { corpusFolderOf, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import * as akm from "./akm.ts";
import { assetsSha256 } from "./inputs.ts";
import { INDEX_BUILDER, indexSpec } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { collectionsFor, failureOf, runCollection, withSemantic } from "./run.ts";

/** The corpora of a run, as lib/corpus.ts resolves them: the committed cases, the public cases rewritten from a seed, and a folder of your own. */
const corpusOf = (name: "public" | "custom", kind: "public" | "rewrite" | "own", config: { seed?: string } = {}, folder = "/nowhere"): ResolvedCorpus => ({ name, folder, rewrite: kind === "rewrite", seed: config.seed ?? null, flag: name === "public" ? "--corpus public" : "--corpus custom" });
const PUBLIC = corpusOf("public", "public");
const REWRITE = corpusOf("custom", "rewrite", { seed: "123" });
const OWN = corpusOf("custom", "own");

const ROOT = join(import.meta.dir, "..", "..", "..");
const dirs: string[] = [];
/** The caller's AKM_BIN. A run records the akm it was started with, so setup() points AKM_BIN at the fake akm it makes, and every test puts the caller's back. */
const callerAkmBin = process.env.AKM_BIN;
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (callerAkmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = callerAkmBin;
});

/**
 * What the fake akm answers to each query: the refs `search` and `curate` return, or an error, and the same for the
 * semantic index. "fallback" is a semantic search that akm answers with keyword search. "nomode" is an answer that does not say
 * how it searched, and "hang" is a call that never answers.
 */
type Reply = string[] | "fail" | "fallback" | "nomode" | "hang";
const ANSWERS: Record<string, Partial<Record<"search" | "curate" | "semantic_search" | "semantic_curate", Reply>>> = {
  alpha: { search: ["a/z", "a/x", "a/q", "a/y"], curate: ["a/x", "a/y", "a/z"], semantic_search: ["a/x", "a/y", "a/z"], semantic_curate: ["a/x", "a/y", "a/z"] },
  beta: { search: [], curate: ["b/x#one", "b/x#two", "b/y"], semantic_search: ["b/y", "b/x#one"], semantic_curate: ["b/x", "b/y"] },
  gamma: { search: ["c/x"], curate: [], semantic_search: ["c/x", "c/y"], semantic_curate: [] },
  boom: { search: "fail", curate: ["d/x"], semantic_search: ["d/x"], semantic_curate: ["d/x"] },
  thanks: { search: [], curate: ["x/1"], semantic_search: ["x/1"], semantic_curate: ["x/1"] },
  "ci passed": { search: ["x/1"], curate: ["x/1"], semantic_search: ["x/1"], semantic_curate: ["x/1"] },
  fallback: { search: ["f/x"], curate: ["f/x"], semantic_search: "fallback", semantic_curate: ["f/x"] },
  nomode: { search: ["f/x"], curate: ["f/x"], semantic_search: "nomode", semantic_curate: ["f/x"] },
  slow: { search: "hang", curate: ["s/x"], semantic_search: ["s/x"], semantic_curate: ["s/x"] },
};

/**
 * An akm that counts the files of the sandbox's bundle, and of every bundle its config names, as its entries, and
 * answers each query from the table above. A semantic akm, as its config says, has embedded every entry and answers with
 * searchMode semantic. It writes the config it was indexed with to `seen-config-keyword.json` or `seen-config-semantic.json`.
 */
const fakeAkm = (dir: string) => `
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
const answers = ${JSON.stringify(ANSWERS)};
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (cmd === "search" && process.argv[3] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const semantic = config.semanticSearchMode === "auto";
const data = process.env.AKM_DATA_DIR;
const folders = [process.env.AKM_BUNDLE_DIR, ...Object.values(config.bundles ?? {}).map((b) => b.path)];
const total = folders.reduce((n, f) => n + readdirSync(f).length, 0);
if (cmd === "index") {
  writeFileSync(${JSON.stringify(dir)} + "/seen-config-" + (semantic ? "semantic" : "keyword") + ".json", JSON.stringify(config));
  const runs = data + "/index-runs";
  const n = (existsSync(runs) ? readFileSync(runs, "utf8").length : 0) + 1;
  writeFileSync(runs, "x".repeat(n));
  writeFileSync(data + "/built-at", "build " + n);
  console.log(JSON.stringify({ ok: true, totalEntries: total, verification: { embeddingCount: semantic ? total : 0, message: "embedded" } }));
  process.exit(0);
}
if (cmd === "info") {
  const built = data + "/built-at";
  console.log(JSON.stringify({ ok: true, indexStats: { entryCount: total, lastBuiltAt: existsSync(built) ? readFileSync(built, "utf8") : "never", hasEmbeddings: semantic } }));
  process.exit(0);
}
const query = rest[rest.indexOf("--") + 1];
const a = answers[query]?.[(semantic ? "semantic_" : "") + cmd];
if (a === "fail") { console.error("boom"); process.exit(70); }
if (a === "hang") await new Promise((r) => setTimeout(r, 60000));
if (!a) { console.error("no answer for " + query); process.exit(1); }
const fellBack = a === "fallback";
const noMode = a === "nomode";
const hits = (fellBack ? [] : noMode ? ["f/x"] : a).map((ref) => ({ ref }));
const answer = noMode ? {} : { searchMode: fellBack ? "fts-fallback" : semantic ? "semantic" : "keyword", ...(fellBack ? { warnings: ["Vector search unavailable: local embedding model is unavailable (request failed)"] } : {}) };
console.log(JSON.stringify(cmd === "search" ? { hits, ...answer } : { items: hits, ...answer }));
`;

const QUERIES = [
  { id: "q1", query: "alpha", kind: "name" },
  { id: "q2", query: "beta", kind: "paraphrase" },
  { id: "q3", query: "gamma", kind: "no-answer" },
  { id: "q4", query: "boom", kind: "direct" },
  { id: "n1", query: "thanks", kind: "chitchat" },
  { id: "n2", query: "ci passed", kind: "notification" },
];
const grade = (id: string, ref: string, g: number) => ({ id, ref, grade: g, reason: "r" });
const QRELS = [grade("q1", "a/x", 3), grade("q1", "a/y", 2), grade("q1", "a/z", 1), grade("q1", "a/w", 0), grade("q2", "b/x", 2), grade("q2", "b/y", 0), grade("q3", "c/x", 1), grade("q3", "c/y", 0), grade("q4", "d/x", 3)];

function setup(queries = QUERIES, qrels: object[] = QRELS) {
  const root = mkdtempSync(join(tmpdir(), "retrieval-run-"));
  dirs.push(root);
  const library = join(root, "library");
  mkdirSync(library);
  writeFileSync(join(library, "README.md"), "a library of one file\n");
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "queries.jsonl"), `${queries.map((q) => JSON.stringify(q)).join("\n")}\n`);
  writeFileSync(join(assets, "qrels.jsonl"), `${qrels.map((q) => JSON.stringify(q)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, fakeAkm(root));
  const created: string[] = [];
  const newSandbox = () => {
    const sandbox = { ...createSandbox("retrieval-test"), cmd: ["bun", script] };
    created.push(sandbox.dir);
    return sandbox;
  };
  const cacheRoot = join(root, "index-cache");
  /** The fake akm for the keyword sandbox, and for the semantic index in the cache, which is in the temp folder. */
  const ctx = { newSandbox, label: "t", semantic: true, cache: { root: cacheRoot, cmd: ["bun", script] } };
  // summary.json says which akm the run was started with, by AKM_BIN. It is the fake one, whatever the caller has set; the afterEach above puts the caller's back.
  const akmBin = commandLine(["bun", script]);
  process.env.AKM_BIN = akmBin;
  return { ctx, folders: { library, assets, results: join(root, "results") }, created, root, cacheRoot, akmBin };
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

/** Runs `f` and returns what it printed. */
const printed = async <T>(f: () => Promise<T>): Promise<{ result: T; lines: string[] }> => {
  const log = console.log;
  const lines: string[] = [];
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    return { result: await f(), lines };
  } finally {
    console.log = log;
  }
};

describe("runCollection", () => {
  test("scores search and curate on the task queries that have a relevant asset", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s).toMatchObject({ eval: "retrieval", corpus: "public", collection: "library", label: "t", akm_version: "0.9.99-test", search_mode: { keyword: "keyword", semantic: "semantic" }, semantic_model: "Xenova/bge-small-en-v1.5", depth: 10, relevant_from_grade: 2, limit: null, n_queries: 6, n_assets: 1, n_scored: 3 });
    expect(Object.keys(s.index_seconds)).toEqual(["keyword", "semantic"]);

    // q1 and q2 are scored for search. q4's search call failed, so it is left out and counted.
    const dcg = 1 + 7 / Math.log2(3) + 3 / Math.log2(5);
    const ideal = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);
    // q2's search returned nothing, so it has no share of judged results: judged_10 is the mean over the queries that returned any.
    expect(s.metrics.search).toMatchObject({ n: 2, p_5: 0.2, success_5: 0.5, mrr: 0.25, recall_10: 0.5, judged_10: 0.75 });
    expect(s.metrics.search.ndcg_10).toBeCloseTo(dcg / ideal / 2, 3);
    // q1's unjudged a/q is taken out of the list for the condensed nDCG: the judged a/z, a/x, a/y move up.
    expect(s.metrics.search.ndcg_10_condensed).toBeCloseTo((1 + 7 / Math.log2(3) + 3 / Math.log2(4)) / ideal / 2, 3);
    expect(s.metrics.search.ndcg_10_condensed as number).toBeGreaterThan(s.metrics.search.ndcg_10 as number);
    expect(s.errored).toEqual({ search: 1, curate: 0, semantic_search: 0, semantic_curate: 0 });

    // q1, q2 and q4 are all scored for curate, and curate put every relevant asset first.
    expect(s.metrics.curate).toEqual({ n: 3, ndcg_10: 1, ndcg_10_condensed: 1, p_5: 0.2667, success_5: 1, mrr: 1, recall_10: 1, judged_10: 1, banned_above: null, banned_above_first: null });
  });

  test("counts the queries with an errored call in any column as n_errored", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.errored.search).toBe(1);
    expect(s.n_errored).toBe(1); // q4, whose search call failed
    const clean = setup(QUERIES.filter((q) => q.id !== "q4"), QRELS.filter((r) => r.id !== "q4"));
    expect((await quiet(() => runCollection(PUBLIC, "library", clean.ctx, clean.folders))).n_errored).toBe(0);
  });

  test("repeatRuns runs a collection N times into <label>-rN-<collection> and writes the spread beside them", async () => {
    const { ctx, folders } = setup();
    const runs = await quiet(() => repeatRuns(2, "t-library", (runLabel) => runCollection(PUBLIC, "library", { ...ctx, label: `t-r${runLabel.slice(-1)}` }, folders)));
    expect(runs.map((r) => r.label)).toEqual(["t-r1", "t-r2"]);
    const day = new Date().toISOString().slice(0, 10);
    expect(readdirSync(folders.results).sort()).toEqual([`${day}-t-library-repeat-summary.json`, `${day}-t-r1-library`, `${day}-t-r2-library`]);
    const spread = JSON.parse(readFileSync(join(folders.results, `${day}-t-library-repeat-summary.json`), "utf8"));
    expect(spread).toMatchObject({ eval: "retrieval", repeat: 2, n_errored: { min: 1, max: 1, mean: 1 }, metrics: { search: { n: { min: 2, max: 2, mean: 2 } } } });
    expect(spread.model).toBeUndefined();
  });

  test("scores the semantic columns from the semantic index: its own answers, its own errors", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    // semantic search puts b/y, which is not relevant, before b/x for q2, and q4 answers where keyword search failed.
    expect(s.metrics.semantic_search).toMatchObject({ n: 3, p_5: 0.2667, success_5: 1, mrr: 0.8333, recall_10: 1, judged_10: 1 });
    expect(s.metrics.semantic_search?.ndcg_10).toBeCloseTo((1 + 3 / Math.log2(3) / 3 + 1) / 3, 3);
    expect(s.metrics.semantic_curate).toEqual({ n: 3, ndcg_10: 1, ndcg_10_condensed: 1, p_5: 0.2667, success_5: 1, mrr: 1, recall_10: 1, judged_10: 1, banned_above: null, banned_above_first: null });
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[3].search.error).toContain("exited 70");
    expect(rows[3].semantic_search).toMatchObject({ refs: ["d/x"], grades: [3] });
    expect(rows[1].semantic_search.refs).toEqual(["b/y", "b/x"]); // the section of b/x folds into it
  });

  test("counts, for non-task inputs and for task queries with no relevant asset, how often akm returned nothing", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.abstention.non_task).toEqual({
      search: { n: 2, abstained: 1, rate: 0.5 },
      curate: { n: 2, abstained: 0, rate: 0 },
      semantic_search: { n: 2, abstained: 0, rate: 0 },
      semantic_curate: { n: 2, abstained: 0, rate: 0 },
    });
    expect(s.abstention.no_answer).toEqual({
      search: { n: 1, abstained: 0, rate: 0 },
      curate: { n: 1, abstained: 1, rate: 1 },
      semantic_search: { n: 1, abstained: 0, rate: 0 },
      semantic_curate: { n: 1, abstained: 1, rate: 1 },
    });
  });

  test("writes summary.json and samples.jsonl: what akm returned, each result's grade, and the scores", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(readdirSync(s.results_dir).sort()).toEqual([".running", "samples.jsonl", "summary.json"]);
    expect(s.results_dir).toMatch(/\/\d{4}-\d{2}-\d{2}-t-library$/);
    const stored = JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.metrics.curate.n).toBe(3);
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null });


    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes

    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "q3", "q4", "n1", "n2"]);
    expect(rows[0]).toMatchObject({ id: "q1", kind: "name", query: "alpha", n_relevant: 2 });
    expect(rows[0].search).toMatchObject({ refs: ["a/z", "a/x", "a/q", "a/y"], grades: [1, 3, null, 2], scores: { p_5: 0.4, success_5: true, mrr: 0.5 } });
    // the sample has both nDCGs: a/q has no grade, so the judged results alone score higher
    expect(rows[0].search.scores.ndcg_10_condensed).toBeCloseTo((1 + 7 / Math.log2(3) + 3 / Math.log2(4)) / (7 + 3 / Math.log2(3) + 1 / Math.log2(4)), 3);
    expect(rows[0].search.scores.ndcg_10_condensed).toBeGreaterThan(rows[0].search.scores.ndcg_10);
    expect(rows[0].curate.scores.ndcg_10_condensed).toBe(rows[0].curate.scores.ndcg_10); // every curate result is judged
    expect(rows[1].curate.refs).toEqual(["b/x", "b/y"]); // the sections of b/x fold into it
    expect(rows[2]).toMatchObject({ n_relevant: 0 });
    expect(rows[2].search.scores).toBeUndefined();
    expect(rows[3].search.error).toContain("exited 70");
    expect(rows[3].search.refs).toEqual([]);
    expect(rows[4]).toMatchObject({ kind: "chitchat", n_relevant: 0 });
  });

  test("copies the library into a sandbox for the keyword index, which it removes afterwards, and into the cache for the semantic one", async () => {
    const { ctx, folders, created, cacheRoot } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.n_assets).toBe(1); // the fake akm counts the files in the bundle: the library's one file
    expect(created).toHaveLength(1);
    for (const dir of created) expect(existsSync(dir)).toBe(false);
    expect(readFileSync(join(cacheRoot, "retrieval-public-library", "bundle", "README.md"), "utf8")).toBe("a library of one file\n");
    expect(readdirSync(cacheRoot)).toEqual(["retrieval-public-library"]); // and nothing is locked
  });

  test("stops before the queries when akm cannot embed the assets, or answers a first semantic search with keyword search", async () => {
    const { ctx, folders, root, created } = setup();
    const withoutEmbeddings = join(root, "no-embeddings-akm.ts");
    writeFileSync(withoutEmbeddings, 'const [cmd] = process.argv.slice(2); if (cmd === "--version") console.log("0.9.99-test"); else console.log(JSON.stringify({ totalEntries: 1, verification: { embeddingCount: 0, message: "Semantic search pending." } }));');
    const without = { ...ctx, newSandbox: () => ({ ...ctx.newSandbox(), cmd: ["bun", withoutEmbeddings] }), cache: { root: ctx.cache.root, cmd: ["bun", withoutEmbeddings] } };
    await expect(quiet(() => runCollection(PUBLIC, "library", without, folders))).rejects.toThrow("akm embedded 0 of 1 assets: Semantic search pending.");
    const first = setup([{ id: "f", query: "fallback", kind: "direct" }, ...QUERIES], [...QRELS, grade("f", "f/x", 3)]);
    await expect(quiet(() => runCollection(PUBLIC, "library", first.ctx, first.folders))).rejects.toThrow("akm cannot search with its embedder: akm search searched with fts-fallback, not semantic");
    for (const dir of [...created, ...first.created]) expect(existsSync(dir)).toBe(false);
    expect(existsSync(first.folders.results)).toBe(false);
  });

  test("counts a semantic call that akm answered with keyword search as an error, and leaves its query out of the semantic column", async () => {
    const { ctx, folders } = setup([...QUERIES, { id: "q5", query: "fallback", kind: "direct" }], [...QRELS, grade("q5", "f/x", 3)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.errored).toEqual({ search: 1, curate: 0, semantic_search: 1, semantic_curate: 0 });
    expect(s.metrics.semantic_search?.n).toBe(3);
    expect(s.metrics.search.n).toBe(3); // q4's keyword search failed, and q5 found f/x
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[6].semantic_search.error).toContain("searched with fts-fallback, not semantic");
    expect(rows[6].search.refs).toEqual(["f/x"]);
  });

  test("a run with a semantic call that failed is aborted, and says why in the summary it writes, which the run then fails with", async () => {
    const { ctx, folders } = setup([...QUERIES, { id: "q5", query: "fallback", kind: "direct" }], [...QRELS, grade("q5", "f/x", 3)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    const reason = "1 semantic calls failed, or answered with keyword search. Their queries are left out of the semantic columns: see the errors in samples.jsonl.";
    expect(s).toMatchObject({ status: "aborted", aborted_reason: reason });
    expect(JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"))).toMatchObject({ status: "aborted", aborted_reason: reason });
    expect(failureOf([s])).toBe(reason);
    // each collection's summary says it for itself, and the run fails with the failed calls of all of them
    const clean = setup(QUERIES.filter((q) => q.id !== "q4"), QRELS.filter((r) => r.id !== "q4"));
    const fine = await quiet(() => runCollection(PUBLIC, "books", clean.ctx, clean.folders));
    expect(fine).toMatchObject({ status: "complete", aborted_reason: null });
    expect(JSON.parse(readFileSync(join(fine.results_dir, "summary.json"), "utf8"))).toMatchObject({ status: "complete", aborted_reason: null });
    expect(failureOf([fine])).toBeUndefined();
    expect(failureOf([fine, s])).toBe(reason);
    expect(failureOf([s, s])).toStartWith("2 semantic calls failed");
  });

  test("a keyword call that failed is counted and left out, and does not abort the run: only the semantic calls do", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false }, folders));
    expect(s.errored).toEqual({ search: 1, curate: 0 }); // q4's search call failed
    expect(s).toMatchObject({ status: "complete", aborted_reason: null });
    expect(failureOf([s])).toBeUndefined();
  });

  test("stops before the queries when the first semantic search does not say how it searched, and counts a later one as an error", async () => {
    const first = setup([{ id: "f", query: "nomode", kind: "direct" }, ...QUERIES], [...QRELS, grade("f", "f/x", 3)]);
    await expect(quiet(() => runCollection(PUBLIC, "library", first.ctx, first.folders))).rejects.toThrow("akm cannot search with its embedder: akm search did not say how it searched (no searchMode), and a semantic call has to say semantic");
    expect(existsSync(first.folders.results)).toBe(false);

    const later = setup([...QUERIES, { id: "q5", query: "nomode", kind: "direct" }], [...QRELS, grade("q5", "f/x", 3)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", later.ctx, later.folders));
    expect(s.errored).toEqual({ search: 1, curate: 0, semantic_search: 1, semantic_curate: 0 });
    expect(s.metrics.semantic_search?.n).toBe(3); // q5 is left out of the semantic column, as a keyword answer would be
    expect(s.metrics.search.n).toBe(3); // q1, q2 and q5: the keyword search of q5 answered
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[6].semantic_search.error).toContain("did not say how it searched (no searchMode)");
    expect(rows[6].semantic_search.refs).toEqual([]);
  });

  test("counts a call that ran into its time limit as a timeout, apart from the other errors, and marks its row", async () => {
    const { ctx, folders } = setup([...QUERIES, { id: "q5", query: "slow", kind: "direct" }], [...QRELS, grade("q5", "s/x", 3)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, callTimeoutMs: 700 }, folders));
    expect(s.timeouts).toBe(1);
    expect(s.errored).toEqual({ search: 2, curate: 0, semantic_search: 0, semantic_curate: 0 }); // q4 failed, q5 timed out: a timeout is an error as well
    expect(s.n_errored).toBe(2);
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[6].search).toMatchObject({ refs: [], error: "akm search timed out after 0.7s", timed_out: true });
    expect(rows[3].search.timed_out).toBeUndefined(); // q4 exited 70 by itself
    expect(rows[6].curate.timed_out).toBeUndefined();
    expect(JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8")).timeouts).toBe(1);
  });

  test("has no timeouts in a run where every call answered", async () => {
    const { ctx, folders } = setup();
    expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).timeouts).toBe(0);
  });

  describe("what the summary records of the run's inputs", () => {
    const plain = { configVersion: "0.9.0", semanticSearchMode: "off", registries: [] };

    test("has the config the eval wrote for each index, and the engine of it, which retrieval does not have", async () => {
      const { ctx, folders } = setup();
      const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(s.config.keyword).toEqual(plain);
      expect(s.config.semantic).toMatchObject({ configVersion: "0.9.0", semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5", queryTimeoutMs: 600_000 } });
      expect(s.engine).toEqual({ engine: null, model: null, endpoint: null, temperature: null, enableThinking: null, timeoutMs: null, engines: {} });
      const stored = JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
      expect(stored.config).toEqual(s.config);
      const keyword = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false }, folders));
      expect(Object.keys(keyword.config)).toEqual(["keyword"]);
    });

    test("redacts a key in the config it records, and names the engine", async () => {
      const { ctx, folders } = setup();
      const withKey = { ...plain, engines: { model: { kind: "llm", provider: "openai", endpoint: "https://api.example.com/v1/chat/completions", model: "m", apiKey: "sk-secret", timeoutMs: 1000 } }, defaults: { llmEngine: "model" } };
      const newSandbox = () => {
        const sb = ctx.newSandbox();
        writeConfig(sb, withKey);
        return sb;
      };
      const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, newSandbox }, folders));
      expect((s.config.keyword as typeof withKey).engines.model.apiKey).toBe("<redacted>");
      expect(readFileSync(join(s.results_dir, "summary.json"), "utf8")).not.toContain("sk-secret");
      expect(s.engine).toMatchObject({ engine: "model", model: "m", endpoint: "https://api.example.com", timeoutMs: 1000, engines: { model: { model: "m", endpoint: "https://api.example.com" } } });
    });

    test("has a digest of the queries and qrels the run read, the same on another machine and different when a grade is added", async () => {
      const a = setup();
      const b = setup();
      const here = process.cwd();
      const first = await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders));
      expect(process.cwd()).toBe(here);
      expect(first.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect((await quiet(() => runCollection(PUBLIC, "library", b.ctx, b.folders))).assets_sha256).toBe(first.assets_sha256); // another folder, the same files
      expect((await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders))).assets_sha256).toBe(first.assets_sha256);
      writeFileSync(join(a.folders.assets, "qrels.jsonl"), `${readFileSync(join(a.folders.assets, "qrels.jsonl"), "utf8")}${JSON.stringify(grade("q1", "a/new", 1))}\n`);
      expect((await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders))).assets_sha256).not.toBe(first.assets_sha256);
    });

    test("covers bundles.json for a library of bundles", async () => {
      const { ctx, folders, root } = setup();
      const library = join(root, "bundles");
      mkdirSync(join(library, "one"), { recursive: true });
      writeFileSync(join(library, "one", "a.md"), "a\n");
      const bundles = join(root, "bundles.json");
      writeFileSync(bundles, JSON.stringify({ one: "akm" }));
      const own = { ...folders, library, bundles };
      const first = await quiet(() => runCollection(OWN, "own", ctx, own));
      writeFileSync(bundles, JSON.stringify({ one: "claude" }));
      expect((await quiet(() => runCollection(OWN, "own", ctx, own))).assets_sha256).not.toBe(first.assets_sha256);
    });

    test("has the seed of the rewrite from its corpus config, and null for the public and own corpora", async () => {
      const { ctx, folders } = setup();
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).seed).toBeNull();
      const rewrite = await quiet(() => runCollection(REWRITE, "library", ctx, folders));
      expect(rewrite.seed).toBe("123");
      expect(JSON.parse(readFileSync(join(rewrite.results_dir, "summary.json"), "utf8")).seed).toBe("123");
      expect(rewrite.manifest.settings.seed).toBe("123");
      // The own set is not made from a seed.
      const own = await quiet(() => runCollection(OWN, "own", ctx, folders));
      expect(own.seed).toBeNull();
      expect(JSON.parse(readFileSync(join(own.results_dir, "summary.json"), "utf8")).seed).toBeNull();
    });

    test("records which corpus it read and where it was, and never a path outside the repository", async () => {
      const { ctx, folders } = setup();
      const own = await quiet(() => runCollection(OWN, "own", ctx, folders));
      expect(own).toMatchObject({ corpus: "custom", corpus_folder: null }); // /nowhere is not in the repository
      const rewrite = await quiet(() => runCollection(REWRITE, "library", ctx, folders));
      expect(rewrite).toMatchObject({ corpus: "custom", seed: "123" });
      const inside = await quiet(() => runCollection(corpusOf("custom", "own", {}, join(ROOT, "private", "retrieval", "own")), "own", ctx, folders));
      expect(inside.corpus_folder).toBe("private/retrieval/own");
      expect(readFileSync(join(own.results_dir, "summary.json"), "utf8")).not.toContain("/nowhere");
      // the public corpus records none, and the rewrite is at its place in the repository
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).corpus_folder).toBeNull();
      const placed = await quiet(() => runCollection(corpusOf("custom", "rewrite", { seed: "123" }, join(ROOT, "private", "retrieval", "assets")), "library", ctx, folders));
      expect(placed.corpus_folder).toBe("private/retrieval/assets");
      expect(placed.corpus_folder).toBe(corpusFolderOf(join(ROOT, "private", "retrieval", "assets")));
      expect(JSON.parse(readFileSync(join(placed.results_dir, "summary.json"), "utf8")).corpus_folder).toBe("private/retrieval/assets");
    });

    test("says which akm built the semantic index, for a new index and for a kept one", async () => {
      const { ctx, folders, akmBin } = setup();
      const first = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      const second = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect([first.semantic_index, second.semantic_index]).toEqual(["cold", "warm"]);
      // The summary writes the home folder as ~, wherever the temp folder is.
      const home = homedir();
      const shown = commandLine(parseCommand(akmBin).map((word) => (word === home || word.startsWith(`${home}/`) ? `~${word.slice(home.length)}` : word)));
      const built = { version: "0.9.99-test", akm_bin: shown, akm_build: null, builtAt: "build 1" };
      expect(first.semantic_index_built_by).toEqual(built);
      expect(second.semantic_index_built_by).toEqual(built);
      const stored = JSON.parse(readFileSync(join(second.results_dir, "summary.json"), "utf8"));
      expect(stored.semantic_index_built_by).toEqual(built);
      const keyword = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false }, folders));
      expect(Object.hasOwn(keyword, "semantic_index_built_by")).toBe(false);
    });

    test("records what --semantic said", async () => {
      const { ctx, folders } = setup();
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).semantic_flag).toBe("auto");
      expect((await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semanticFlag: "on" }, folders))).semantic_flag).toBe("on");
      const off = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false, semanticFlag: "off" }, folders));
      expect(off.semantic_flag).toBe("off");
      expect(JSON.parse(readFileSync(join(off.results_dir, "summary.json"), "utf8")).semantic_flag).toBe("off");
    });
  });

  describe("the library in assets_sha256", () => {
    /** A library of two notes in a folder. Neither is graded in the qrels: the digest covers what akm indexes, judged or not. */
    const notes = (library: string) => {
      mkdirSync(join(library, "knowledge"));
      writeFileSync(join(library, "knowledge", "retry.md"), "Retry busy requests\n");
      writeFileSync(join(library, "knowledge", "backoff.md"), "Wait longer after each retry\n");
    };
    /** Two queries are enough to tell one run from another here, and each run of the fake akm costs a process for every call. */
    const lean = () => setup([QUERIES[0], QUERIES[4]], QRELS.filter((r) => r.id === "q1"));
    /** What can happen to an asset of the library. */
    const CHANGES: Record<string, (library: string) => void> = {
      "an edited asset": (library) => writeFileSync(join(library, "knowledge", "retry.md"), "Never retry busy requests\n"),
      "an added asset": (library) => writeFileSync(join(library, "knowledge", "timeouts.md"), "Give every call a time limit\n"),
      "a removed asset": (library) => rmSync(join(library, "knowledge", "backoff.md")),
      "a renamed asset": (library) => renameSync(join(library, "knowledge", "backoff.md"), join(library, "knowledge", "waiting.md")),
    };

    for (const [what, change] of Object.entries(CHANGES)) {
      test(`${what} changes the digest of a run with a new semantic index, of a run with a kept one, and of a run with keyword search only`, async () => {
        const { ctx, folders } = lean();
        notes(folders.library);
        const run = (over: { semantic?: boolean } = {}) => quiet(() => runCollection(PUBLIC, "library", { ...ctx, ...over }, folders));
        const cold = await run();
        const warm = await run();
        expect([cold.semantic_index, warm.semantic_index]).toEqual(["cold", "warm"]);
        // The same library has one identity: a kept index and a run without the semantic search do not change it.
        expect(warm.assets_sha256).toBe(cold.assets_sha256);
        expect((await run({ semantic: false })).assets_sha256).toBe(cold.assets_sha256);

        change(folders.library);
        const keyword = await run({ semantic: false });
        expect(keyword.assets_sha256).not.toBe(cold.assets_sha256);
        const rebuilt = await run();
        expect(rebuilt.semantic_index).toBe("cold"); // the kept index is not used for another library
        expect(rebuilt.assets_sha256).not.toBe(cold.assets_sha256);
        const kept = await run();
        expect(kept.semantic_index).toBe("warm");
        expect(kept.assets_sha256).not.toBe(cold.assets_sha256);
        // and the changed library has one identity as well
        expect([rebuilt.assets_sha256, kept.assets_sha256]).toEqual([keyword.assets_sha256, keyword.assets_sha256]);
        // Only the library's digest moved: the queries and the qrels are the same files.
        expect({ ...kept.assets, library_sha256: cold.assets.library_sha256 }).toEqual(cold.assets);
        expect(kept.assets.library_sha256).not.toBe(cold.assets.library_sha256);
        expect(JSON.parse(readFileSync(join(kept.results_dir, "summary.json"), "utf8")).assets_sha256).toBe(kept.assets_sha256);
      });
    }

    test("is the same for the same library in another folder, whatever the dates of its files, and for a file written again with the text it had", async () => {
      const [a, b] = [lean(), lean()];
      for (const { folders } of [a, b]) notes(folders.library);
      const first = await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders));
      const other = await quiet(() => runCollection(PUBLIC, "library", b.ctx, b.folders));
      expect(other.assets).toEqual(first.assets);
      expect(other.assets_sha256).toBe(first.assets_sha256);
      utimesSync(join(b.folders.library, "knowledge", "retry.md"), new Date(0), new Date(0));
      writeFileSync(join(a.folders.library, "knowledge", "retry.md"), "Retry busy requests\n");
      expect((await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders))).assets_sha256).toBe(first.assets_sha256);
      expect((await quiet(() => runCollection(PUBLIC, "library", b.ctx, b.folders))).assets_sha256).toBe(first.assets_sha256);
      // the same change to both gives the same digest again
      for (const { folders } of [a, b]) CHANGES["an edited asset"](folders.library);
      const [edited, alsoEdited] = [await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders)), await quiet(() => runCollection(PUBLIC, "library", b.ctx, b.folders))];
      expect(edited.assets_sha256).not.toBe(first.assets_sha256);
      expect(alsoEdited.assets_sha256).toBe(edited.assets_sha256);
    });

    test("is made of digests that the summary keeps: the library, the bundle mapping, the queries and the qrels, each changing with its own file", async () => {
      const { ctx, folders } = lean();
      notes(folders.library);
      const first = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      const stored = JSON.parse(readFileSync(join(first.results_dir, "summary.json"), "utf8"));
      expect(stored.assets).toEqual(first.assets);
      expect(Object.keys(stored.assets)).toEqual(["library_sha256", "bundles_sha256", "queries_sha256", "qrels_sha256"]);
      expect(stored.assets.library_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.assets.bundles_sha256).toBeNull(); // this library has no bundles.json
      expect(stored.assets.queries_sha256).toBe(sha256File(join(folders.assets, "queries.jsonl")));
      expect(stored.assets.qrels_sha256).toBe(sha256File(join(folders.assets, "qrels.jsonl")));
      expect(stored.assets_sha256).toBe(assetsSha256(stored.assets));

      CHANGES["an edited asset"](folders.library);
      const edited = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(edited.assets.library_sha256).not.toBe(first.assets.library_sha256);
      expect({ ...edited.assets, library_sha256: first.assets.library_sha256 }).toEqual(first.assets);

      writeFileSync(join(folders.assets, "qrels.jsonl"), `${readFileSync(join(folders.assets, "qrels.jsonl"), "utf8")}${JSON.stringify(grade("q1", "a/new", 1))}\n`);
      const graded = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(graded.assets.qrels_sha256).not.toBe(edited.assets.qrels_sha256);
      expect({ ...graded.assets, qrels_sha256: edited.assets.qrels_sha256 }).toEqual(edited.assets);
      expect(graded.assets_sha256).not.toBe(edited.assets_sha256);

      writeFileSync(join(folders.assets, "queries.jsonl"), `${readFileSync(join(folders.assets, "queries.jsonl"), "utf8")}${JSON.stringify({ id: "n3", query: "thanks", kind: "chitchat" })}\n`);
      const asked = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(asked.assets.queries_sha256).not.toBe(graded.assets.queries_sha256);
      expect({ ...asked.assets, queries_sha256: graded.assets.queries_sha256 }).toEqual(graded.assets);
    });

    describe("of a library of bundles", () => {
      /** Bundles in `root`: `one` is in the library, `two` is a link to a folder outside it, and `three` is named by a path that leaves it. */
      const layout = (root: string) => {
        const library = join(root, "bundles");
        const outside = join(root, "outside");
        for (const dir of [join(library, "one"), join(outside, "two-notes"), join(root, "shared", "three")]) mkdirSync(dir, { recursive: true });
        symlinkSync(join(outside, "two-notes"), join(library, "two"));
        for (const [dir, text] of [[join(library, "one"), "one\n"], [join(outside, "two-notes"), "two\n"], [join(root, "shared", "three"), "three\n"]]) {
          writeFileSync(join(dir, "a.md"), text);
          writeFileSync(join(dir, "b.md"), `${text}, too\n`);
        }
        const bundles = join(root, "bundles.json");
        writeFileSync(bundles, JSON.stringify({ one: "akm", two: "akm", "../shared/three": "akm" }));
        return { library, bundles, folders: { one: join(library, "one"), two: join(outside, "two-notes"), three: join(root, "shared", "three") } };
      };
      const STEPS: [string, (dir: string) => void][] = [
        ["edit", (dir) => writeFileSync(join(dir, "a.md"), "edited\n")],
        ["add", (dir) => writeFileSync(join(dir, "c.md"), "new\n")],
        ["remove", (dir) => rmSync(join(dir, "b.md"))],
        ["rename", (dir) => renameSync(join(dir, "a.md"), join(dir, "z.md"))],
      ];

      for (const bundle of ["one", "two", "three"] as const) {
        test(`${bundle === "one" ? "an asset in a bundle of the library" : bundle === "two" ? "an asset in a bundle that is a link to a folder outside the library" : "an asset in a bundle that bundles.json names by a path outside the library"} is covered, whether it is edited, added, removed or renamed`, async () => {
          const { ctx, folders, root } = lean();
          const { library, bundles, folders: where } = layout(root);
          const own = { ...folders, library, bundles };
          const seen = [(await quiet(() => runCollection(OWN, "own", ctx, own))).assets_sha256];
          for (const [step, apply] of STEPS) {
            apply(where[bundle]);
            const cold = await quiet(() => runCollection(OWN, "own", ctx, own));
            const warm = await quiet(() => runCollection(OWN, "own", ctx, own));
            expect([cold.semantic_index, warm.semantic_index]).toEqual(["cold", "warm"]);
            const keyword = await quiet(() => runCollection(OWN, "own", { ...ctx, semantic: false }, own));
            expect(seen, step).not.toContain(cold.assets_sha256); // a digest that no earlier state of the bundles had
            expect([warm.assets_sha256, keyword.assets_sha256], step).toEqual([cold.assets_sha256, cold.assets_sha256]);
            seen.push(cold.assets_sha256);
          }
        });
      }

      test("is the same wherever the bundles are, and changes with the adapter and the names but not with the library's path", async () => {
        const [a, b] = [lean(), lean()];
        const [one, two] = [layout(a.root), layout(b.root)];
        const first = await quiet(() => runCollection(OWN, "own", a.ctx, { ...a.folders, library: one.library, bundles: one.bundles }));
        const other = await quiet(() => runCollection(OWN, "own", b.ctx, { ...b.folders, library: two.library, bundles: two.bundles }));
        expect(other.assets).toEqual(first.assets);
        expect(first.assets.bundles_sha256).toMatch(/^[0-9a-f]{64}$/);

        writeFileSync(one.bundles, JSON.stringify({ "../shared/three": "akm", two: "akm", one: "claude" }));
        const adapter = await quiet(() => runCollection(OWN, "own", a.ctx, { ...a.folders, library: one.library, bundles: one.bundles }));
        expect(adapter.assets.bundles_sha256).not.toBe(first.assets.bundles_sha256);
        expect(adapter.assets.library_sha256).toBe(first.assets.library_sha256); // the same files
        expect(adapter.assets_sha256).not.toBe(first.assets_sha256);

        writeFileSync(one.bundles, JSON.stringify({ one: "akm", two: "akm" })); // a bundle left out is not indexed, so its files are not part of the library
        const fewer = await quiet(() => runCollection(OWN, "own", a.ctx, { ...a.folders, library: one.library, bundles: one.bundles }));
        expect(fewer.assets.library_sha256).not.toBe(first.assets.library_sha256);
        writeFileSync(join(one.folders.three, "a.md"), "edited, but not indexed\n");
        expect((await quiet(() => runCollection(OWN, "own", a.ctx, { ...a.folders, library: one.library, bundles: one.bundles }))).assets_sha256).toBe(fewer.assets_sha256);
      });
    });
  });

  describe("the judges of the qrels", () => {
    const judged = (judge: string, g: ReturnType<typeof grade>) => ({ ...g, judge });
    const mixed = [...QRELS.slice(1), judged("judge-a", QRELS[0]), judged("judge-b", grade("q1", "a/extra", 0))];

    test("warns once when they hold the grades of more than one judge, however many collections or repeats read them", async () => {
      const { ctx, folders } = setup(QUERIES, mixed);
      const { error } = console;
      const warnings: string[] = [];
      console.error = (...a: unknown[]) => void warnings.push(a.join(" "));
      try {
        await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
        await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      } finally {
        console.error = error;
      }
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("retrieval: warning: ");
      expect(warnings[0]).toContain("qrels.jsonl holds grades from 2 judges (judge-a, judge-b), and 8 rows that record no judge");
    });

    test("says nothing for one judge, or for rows that record none", async () => {
      const { error } = console;
      const warnings: string[] = [];
      console.error = (...a: unknown[]) => void warnings.push(a.join(" "));
      try {
        const none = setup();
        await quiet(() => runCollection(PUBLIC, "library", none.ctx, none.folders));
        const one = setup(QUERIES, QRELS.map((g) => judged("judge-a", g)));
        await quiet(() => runCollection(PUBLIC, "library", one.ctx, one.folders));
      } finally {
        console.error = error;
      }
      expect(warnings).toEqual([]);
    });

    test("warns when one judge's grades sit beside rows that record none, and not once those pairs are graded again", async () => {
      const { error } = console;
      const warnings: string[] = [];
      console.error = (...a: unknown[]) => void warnings.push(a.join(" "));
      try {
        const beside = setup(QUERIES, [judged("judge-a", QRELS[0]), judged("judge-a", QRELS[1]), ...QRELS.slice(2)]);
        await quiet(() => runCollection(PUBLIC, "library", beside.ctx, beside.folders));
        const again = setup(QUERIES, [...QRELS, ...QRELS.map((g) => judged("judge-a", g))]); // every pair graded again by one judge: the rows before it are history
        await quiet(() => runCollection(PUBLIC, "library", again.ctx, again.folders));
      } finally {
        console.error = error;
      }
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`holds grades from 1 judge (judge-a), and ${QRELS.length - 2} rows that record no judge`);
    });
  });

  describe("the semantic index kept between runs", () => {
    const rows = (dir: string) => readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.search.refs, r.semantic_search.refs, r.semantic_curate.refs]);
    const runs = (cacheRoot: string, name = "retrieval-public-library") => readFileSync(join(cacheRoot, name, "data", "index-runs"), "utf8").length;

    test("is used as it is by the next run, which has the same rankings, and akm does not index it again", async () => {
      const { ctx, folders, cacheRoot } = setup();
      const lines: string[] = [];
      const log = console.log;
      console.log = (...a: unknown[]) => void lines.push(a.join(" "));
      let first: Awaited<ReturnType<typeof runCollection>>;
      let second: Awaited<ReturnType<typeof runCollection>>;
      try {
        first = await runCollection(PUBLIC, "library", ctx, folders);
        second = await runCollection(PUBLIC, "library", ctx, folders);
      } finally {
        console.log = log;
      }
      expect([first.semantic_index, second.semantic_index]).toEqual(["cold", "warm"]);
      expect(JSON.parse(readFileSync(join(second.results_dir, "summary.json"), "utf8")).semantic_index).toBe("warm");
      expect(runs(cacheRoot)).toBe(1);
      expect(lines.join("\n")).toMatch(/1 assets indexed in [\d.]+ s: a new index\n/);
      expect(lines.join("\n")).toMatch(/1 assets indexed in [\d.]+ s: kept from an earlier run\n/);
      expect(lines.join("\n")).toMatch(/index [\d.]+ s for keyword search, [\d.]+ s for semantic \(kept from an earlier run\)/);
      expect(rows(second.results_dir)).toEqual(rows(first.results_dir));
    });

    test("is built again when a file changed, is gone or is new", async () => {
      const { ctx, folders, cacheRoot } = setup();
      await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      mkdirSync(join(folders.library, "skills"));
      writeFileSync(join(folders.library, "skills", "new.md"), "a new skill\n");
      const added = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(added.semantic_index).toBe("cold");
      expect(added.n_assets).toBe(2);
      expect(runs(cacheRoot)).toBe(1); // from nothing
      expect(readFileSync(join(cacheRoot, "retrieval-public-library", "bundle", "skills", "new.md"), "utf8")).toBe("a new skill\n");

      writeFileSync(join(folders.library, "README.md"), "a library of one file, edited\n");
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).semantic_index).toBe("cold");
      rmSync(join(folders.library, "skills"), { recursive: true });
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).semantic_index).toBe("cold");
      expect((await quiet(() => runCollection(PUBLIC, "library", ctx, folders))).semantic_index).toBe("warm");
    });

    test("is keyed on the code that lays the library out, src/akm.ts, so a change to it builds a new index (part of #73)", async () => {
      const { ctx, folders, root } = setup();
      // what cachedIndex is given: the builder is akm.ts, from the repository, as an absolute path
      const contents = akm.libraryFiles(folders.library);
      expect(indexSpec({ name: "retrieval-public-library", contents }, "1.2.3")).toEqual({ name: "retrieval-public-library", version: "1.2.3", files: contents.files, extra: undefined, builder: [join(ROOT, "evals", "retrieval", "src", "akm.ts")] });
      expect(INDEX_BUILDER).toEqual([join(import.meta.dir, "akm.ts")]);
      expect(existsSync(INDEX_BUILDER[0] as string)).toBe(true);
      // and the index it keeps is for the content of the builder files
      const builder = join(root, "builder.ts");
      writeFileSync(builder, "one way to lay a library out\n");
      const cache = { ...ctx.cache, builder: [builder] };
      expect((await quiet(() => runCollection(PUBLIC, "library", { ...ctx, cache }, folders))).semantic_index).toBe("cold");
      expect((await quiet(() => runCollection(PUBLIC, "library", { ...ctx, cache }, folders))).semantic_index).toBe("warm");
      writeFileSync(builder, "another way\n");
      expect((await quiet(() => runCollection(PUBLIC, "library", { ...ctx, cache }, folders))).semantic_index).toBe("cold");
    });

    test("is built again when akm says that it holds other than what it was built with, and the run says so", async () => {
      const { ctx, folders, cacheRoot } = setup();
      await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      writeFileSync(join(cacheRoot, "retrieval-public-library", "data", "built-at"), "someone indexed it again");
      const { result, lines } = await printed(() => runCollection(PUBLIC, "library", ctx, folders));
      expect(result.semantic_index).toBe("rebuilt");
      expect(lines.join("\n")).toContain("the index of an earlier run is not what it was built as, and a new one is built from scratch. akm said: akm says the index was built at someone indexed it again, and it was built at build 1");
      expect(runs(cacheRoot)).toBe(1);
    });

    test("keeps an index for each collection, and none for a run without the semantic search", async () => {
      const { ctx, folders, cacheRoot } = setup();
      await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
      await quiet(() => runCollection(PUBLIC, "books", ctx, folders));
      await quiet(() => runCollection(REWRITE, "books", ctx, folders));
      expect(readdirSync(cacheRoot).sort()).toEqual(["retrieval-public-books", "retrieval-public-library", "retrieval-rewrite-books"]);
      const keyword = setup();
      await quiet(() => runCollection(PUBLIC, "library", { ...keyword.ctx, semantic: false }, keyword.folders));
      expect(existsSync(keyword.cacheRoot)).toBe(false);
    });
  });

  test("without the semantic index, makes one sandbox and has the keyword columns only", async () => {
    const { ctx, folders, created, root } = setup();
    const { result: s, lines } = await printed(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false }, folders));
    expect(created).toHaveLength(1);
    expect(existsSync(join(root, "seen-config-semantic.json"))).toBe(false);
    expect(s.search_mode).toEqual({ keyword: "keyword" });
    expect(s.semantic_model).toBeUndefined();
    expect(Object.keys(s.index_seconds)).toEqual(["keyword"]);
    for (const columns of [s.metrics, s.errored, s.abstention.non_task, s.abstention.no_answer]) expect(Object.keys(columns)).toEqual(["search", "curate"]);
    expect(s.metrics.search).toMatchObject({ n: 2, success_5: 0.5 });
    expect(s.metrics.curate).toMatchObject({ n: 3, success_5: 1 });
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(Object.keys(rows[0]).sort()).toEqual(["curate", "id", "kind", "n_relevant", "query", "search"]);
    expect(lines.join("\n")).not.toContain("semantic");
    const stored = JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    expect(stored.semantic_model).toBeUndefined();
    for (const dir of created) expect(existsSync(dir)).toBe(false);
  });

  test("a keyword-only run does not stop at a query that the semantic search would have answered with keyword search", async () => {
    const { ctx, folders } = setup([{ id: "f", query: "fallback", kind: "direct" }, ...QUERIES], [...QRELS, grade("f", "f/x", 3)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, semantic: false }, folders));
    expect(s.metrics.search.n).toBe(3);
  });

  test("scores the semantic search in a full run of the public and rewrite corpora, and not with --limit or in the own corpus", () => {
    expect(withSemantic(false)).toBe(true); // the public and the rewrite corpora
    expect(withSemantic(false, 20)).toBe(false);
    expect(withSemantic(false, 1)).toBe(false);
    expect(withSemantic(true)).toBe(false); // your own
    expect(withSemantic(true, 20)).toBe(false);
  });

  test("--semantic on scores it for any corpus and with --limit, off never, and auto is the rule above", () => {
    for (const [own, limit] of [[false, undefined], [false, 20], [false, 1], [true, undefined], [true, 20]] as const) {
      expect(withSemantic(own, limit, "on")).toBe(true);
      expect(withSemantic(own, limit, "off")).toBe(false);
      expect(withSemantic(own, limit, "auto")).toBe(withSemantic(own, limit));
    }
  });

  test("with --semantic on, a run with --limit builds the semantic index and has the four columns", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, limit: 3, semantic: withSemantic(false, 3, "on"), semanticFlag: "on" }, folders));
    expect(s).toMatchObject({ limit: 3, n_queries: 3, semantic_flag: "on", semantic_index: "cold" });
    expect(Object.keys(s.metrics)).toEqual(["search", "curate", "semantic_search", "semantic_curate"]);
  });

  test("runs N queries, in the task and non-task proportion, with --limit", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", { ...ctx, limit: 3 }, folders));
    expect(s).toMatchObject({ limit: 3, n_queries: 3 });
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "n1"]);
  });

  test("starts a second results folder when the first exists, and uses akm's version for a default label", async () => {
    const { ctx, folders } = setup();
    const a = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    const b = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(b.results_dir).toBe(`${a.results_dir}-2`);
    const c = await quiet(() => runCollection(PUBLIC, "library", { newSandbox: ctx.newSandbox, semantic: true, cache: ctx.cache }, folders));
    expect(c.label).toBe("akm-0.9.99-test");
    expect(c.results_dir).toMatch(/-akm-0\.9\.99-test-library$/);
  });

  test("refuses a task query that has no grades, and removes nothing it did not make", async () => {
    const { ctx, folders } = setup(QUERIES, QRELS.filter((r) => r.id !== "q4"));
    await expect(quiet(() => runCollection(PUBLIC, "library", ctx, folders))).rejects.toThrow("q4 has no grades in qrels.jsonl. Run evals/retrieval/label first.");
    expect(existsSync(folders.results)).toBe(false);
    await expect(quiet(() => runCollection(PUBLIC, "books", ctx, folders))).rejects.toThrow(/^q4 has no grades in qrels.jsonl.$/);
  });

  test("reports a run with no query that has a relevant asset as empty numbers, not as zeros", async () => {
    const { ctx, folders } = setup([QUERIES[2], QUERIES[4]], [grade("q3", "c/x", 1)]);
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.n_scored).toBe(0);
    expect(s.metrics.search.ndcg_10).toBeNull();
    expect(s.metrics.semantic_search?.ndcg_10).toBeNull();
    expect(s.abstention.no_answer.search.n).toBe(1);
  });
});

describe("the manifest", () => {
  const stored = (dir: string) => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

  test("is in summary.json with the eval's version, the settings of the run and what was scored", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(readManifest(stored(s.results_dir)).kind).toBe("manifest");
    expect(s.manifest).toMatchObject({
      manifest_version: 1,
      eval: "retrieval",
      corpus: "public",
      collection: "library",
      mode: null,
      harness_version: parts.harness_version,
      collector: parts.collector,
      akm: { version: "0.9.99-test", build: null, build_fingerprint: null },
      settings: { strategy: null, config_patch_sha256: null, timeout_ms: akm.CALL_TIMEOUT_MS, seed: null },
      engines: {},
      treatment_hints: {},
    });
    expect(s.manifest.akm.bin).toBe(s.akm_bin);
    expect(s.manifest.config.redacted).toEqual(s.config);

    expect(s.manifest.completion).toEqual({ selected: ["q1", "q2", "q3", "q4", "n1", "n2"], scored: ["q1", "q2", "q3", "n1", "n2"], errored: ["q4"] }); // q4's search call failed
    expect(JSON.stringify(s.manifest)).not.toContain(folders.library);
  });

  test("gives each query a digest of its input, the query in the library akm indexed, and of its labels, the kind, the grades and the bans", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    const library = { library_sha256: s.assets.library_sha256, bundles_sha256: null };
    expect(Object.keys(s.manifest.cases)).toEqual(["q1", "q2", "q3", "q4", "n1", "n2"]);
    expect(s.manifest.cases.q1).toEqual({
      input_sha256: sha256Json({ query: "alpha", library }),
      label_sha256: sha256Json({ kind: "name", grades: { "a/x": 3, "a/y": 2, "a/z": 1, "a/w": 0 }, banned: [] }),
    });
    expect(s.manifest.cases.n1).toEqual({ input_sha256: sha256Json({ query: "thanks", library }), label_sha256: sha256Json({ kind: "chitchat", grades: {}, banned: [] }) });
  });

  test("a library with another file in it is another input for every query, and a grade added is another label for its query alone", async () => {
    const a = setup();
    const first = await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders));
    writeFileSync(join(a.folders.library, "NEW.md"), "a new file\n");
    const second = await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders));
    for (const id of Object.keys(first.manifest.cases)) {
      expect(second.manifest.cases[id]?.input_sha256).not.toBe(first.manifest.cases[id]?.input_sha256);
      expect(second.manifest.cases[id]?.label_sha256).toBe(first.manifest.cases[id]?.label_sha256);
    }
    writeFileSync(join(a.folders.assets, "qrels.jsonl"), `${readFileSync(join(a.folders.assets, "qrels.jsonl"), "utf8")}${JSON.stringify(grade("q2", "b/new", 3))}\n`);
    const third = await quiet(() => runCollection(PUBLIC, "library", a.ctx, a.folders));
    for (const id of Object.keys(second.manifest.cases)) {
      expect(third.manifest.cases[id]?.input_sha256).toBe(second.manifest.cases[id]?.input_sha256);
      expect(third.manifest.cases[id]?.label_sha256 === second.manifest.cases[id]?.label_sha256).toBe(id !== "q2");
    }
  });

  test("covers the queries a run selected, and records the time limit of a call and the seed of a rewrite", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(REWRITE, "library", { ...ctx, limit: 3, callTimeoutMs: 30_000 }, folders));
    expect(s.manifest.corpus).toBe(s.corpus);
    expect(s.manifest.completion.selected.length).toBe(3);
    expect(Object.keys(s.manifest.cases)).toEqual(s.manifest.completion.selected);
    expect(s.manifest.settings).toMatchObject({ timeout_ms: 30_000, seed: "123" });
  });
});

describe("banned assets", () => {
  // q1 bans a/z, which search puts first. q2 bans b/y, which curate puts after b/x, and search returns nothing.
  const queries = QUERIES.slice(0, 2);
  const qrels = [grade("q1", "a/x", 3), grade("q1", "a/y", 2), { ...grade("q1", "a/z", 0), banned: true }, grade("q2", "b/x", 2), { ...grade("q2", "b/y", 0), banned: true }];

  test("counts the queries where a banned asset ranks above a relevant one", async () => {
    const { ctx, folders } = setup(queries, qrels);
    const s = await quiet(() => runCollection(PUBLIC, "books", ctx, folders));
    expect(s.collection).toBe("books");
    expect(s.metrics.search.banned_above).toBe(0.5);
    expect(s.metrics.curate.banned_above).toBe(0);
    expect(s.metrics.semantic_search?.banned_above).toBe(0.5); // q1 puts a/z, banned, after a/x and a/y, but q2 puts b/y, banned, first
    expect(s.metrics.semantic_curate?.banned_above).toBe(0);
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[0].search.scores.banned_above).toBe(true);
    expect(rows[0].curate.scores.banned_above).toBe(false);
    expect(rows[0].search.grades).toEqual([0, 3, null, 2]);
  });

  test("leaves the metric empty when no query bans an asset", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection(PUBLIC, "library", ctx, folders));
    expect(s.metrics.search.banned_above).toBeNull();
    expect(s.results_dir).toEndWith("-t-library");
  });
});

describe("a set of your own", () => {
  test("indexes a library of bundles where it is, one bundle for each folder, and never copies it", async () => {
    const { ctx, folders, root } = setup();
    const library = join(root, "bundles");
    mkdirSync(join(library, "one"), { recursive: true });
    mkdirSync(join(library, "two"), { recursive: true });
    writeFileSync(join(library, "one", "a.md"), "a\n");
    writeFileSync(join(library, "two", "b.md"), "b\n");
    const bundles = join(root, "bundles.json");
    writeFileSync(bundles, JSON.stringify({ one: "akm", two: "claude" }));
    const s = await quiet(() => runCollection(OWN, "own", ctx, { ...folders, library, bundles }));
    expect(s).toMatchObject({ corpus: "custom", collection: "own", n_assets: 2 }); // had the library been copied as well, the fake akm would count 4
    expect(s.results_dir).toEndWith("-t-own");
    const seen = JSON.parse(readFileSync(join(root, "seen-config-keyword.json"), "utf8"));
    expect(seen.semanticSearchMode).toBe("off");
    expect(seen.defaultBundle).toBeUndefined();
    expect(seen.bundles).toEqual({
      one: { path: join(realpathSync(library), "one"), components: { main: { adapter: "akm" } }, writable: false },
      two: { path: join(realpathSync(library), "two"), components: { main: { adapter: "claude" } }, writable: false },
    });
    // the semantic index has the same bundles, and searches with the embedder as well
    const semantic = JSON.parse(readFileSync(join(root, "seen-config-semantic.json"), "utf8"));
    expect(semantic).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" }, bundles: seen.bundles });
  });

  test("keeps the semantic index of bundles that are indexed where they are, and builds it again when a file of one changed or is new", async () => {
    const { ctx, folders, root, cacheRoot } = setup();
    const library = join(root, "bundles");
    mkdirSync(join(library, "one"), { recursive: true });
    writeFileSync(join(library, "one", "a.md"), "a\n");
    const bundles = join(root, "bundles.json");
    writeFileSync(bundles, JSON.stringify({ one: "akm" }));
    const own = { ...folders, library, bundles };
    const first = await quiet(() => runCollection(OWN, "own", ctx, own));
    const second = await quiet(() => runCollection(OWN, "own", ctx, own));
    expect([first.semantic_index, second.semantic_index]).toEqual(["cold", "warm"]);
    expect(readdirSync(cacheRoot)).toEqual([`retrieval-own-${sha256Text(OWN.folder).slice(0, 8)}`]); // the index of an own folder is named by the folder
    expect(existsSync(join(cacheRoot, readdirSync(cacheRoot)[0] as string, "bundle", "one"))).toBe(false); // nothing is copied
    writeFileSync(join(library, "one", "b.md"), "b\n");
    expect((await quiet(() => runCollection(OWN, "own", ctx, own))).semantic_index).toBe("cold"); // a file that is new
    writeFileSync(join(library, "one", "a.md"), "a, edited\n");
    expect((await quiet(() => runCollection(OWN, "own", ctx, own))).semantic_index).toBe("cold");
    writeFileSync(bundles, JSON.stringify({ one: "claude" })); // the same files with another adapter are another index
    expect((await quiet(() => runCollection(OWN, "own", ctx, own))).semantic_index).toBe("cold");
    expect((await quiet(() => runCollection(OWN, "own", ctx, own))).semantic_index).toBe("warm");
  });

  test("copies a library without bundles.json into the sandbox as one bundle, and follows a link to it", async () => {
    const { ctx, folders, root } = setup();
    const link = join(root, "link");
    symlinkSync(folders.library, link);
    const s = await quiet(() => runCollection(OWN, "own", ctx, { ...folders, library: link, bundles: join(root, "missing.json") }));
    expect(s.n_assets).toBe(1);
    expect(JSON.parse(readFileSync(join(root, "seen-config-keyword.json"), "utf8")).bundles).toBeUndefined();
    expect(JSON.parse(readFileSync(join(root, "seen-config-semantic.json"), "utf8")).bundles).toBeUndefined();
  });

  test("says how to make a set when the queries are not in the eval's format", async () => {
    const { ctx, folders } = setup([{ qid: "q1", query: "alpha", class: "task" }] as never);
    await expect(quiet(() => runCollection(OWN, "own", ctx, folders))).rejects.toThrow(/has no string "id"\n.*queries.jsonl and qrels.jsonl in the format.*Run it with: evals\/retrieval\/run --cases DIR/s);
    await expect(quiet(() => runCollection(PUBLIC, "library", ctx, folders))).rejects.toThrow(/^[^\n]*has no string "id"$/);
  });
});

describe("ask", () => {
  /** An akm that prints this JSON for every search or curate, with the version and help it needs to be asked at all. */
  const printing = (json: unknown, sleepMs = 0) => `
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (cmd === "search" && rest[0] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
${sleepMs ? `await new Promise((r) => setTimeout(r, ${sleepMs}));` : ""}
console.log(${JSON.stringify(JSON.stringify(json))});
`;
  const boxFor = (json: unknown, sleepMs = 0) => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-ask-"));
    dirs.push(root);
    const script = join(root, "akm.ts");
    writeFileSync(script, printing(json, sleepMs));
    const sandbox = createSandbox("retrieval-ask");
    dirs.push(sandbox.dir);
    return { ...sandbox, cmd: ["bun", script] };
  };

  test("a semantic call has to say it searched with embeddings: no searchMode is an error, as keyword and fts-fallback are", async () => {
    const hits = [{ ref: "a/x" }];
    const said = await akm.ask(boxFor({ hits, searchMode: "semantic" }), "search", "q", 10, "semantic");
    expect(said).toMatchObject({ refs: ["a/x"], mode: "semantic" });
    expect(said.error).toBeUndefined();
    const silent = await akm.ask(boxFor({ hits }), "search", "q", 10, "semantic");
    expect(silent).toMatchObject({ refs: [], mode: null });
    expect(silent.error).toBe("akm search did not say how it searched (no searchMode), and a semantic call has to say semantic: null");
    const curated = await akm.ask(boxFor({ items: hits }), "curate", "q", 10, "semantic");
    expect(curated.error).toContain("did not say how it searched");
    const other = await akm.ask(boxFor({ hits, searchMode: "keyword" }), "search", "q", 10, "semantic");
    expect(other.error).toContain("searched with keyword, not semantic");
  });

  test("a semantic curate that abstains, with no results and no searchMode, is an empty answer and not an error", async () => {
    const abstained = await akm.ask(boxFor({ summary: "Curate abstained: the input is a harness or tool envelope, not a task.", items: [] }), "curate", "<task-notification>x</task-notification>", 10, "semantic");
    expect(abstained).toMatchObject({ refs: [], assets: [], mode: null });
    expect(abstained.error).toBeUndefined();
  });

  test("a keyword call is taken as it comes when it does not say, and fails when it says semantic", async () => {
    const hits = [{ ref: "a/x" }];
    expect(await akm.ask(boxFor({ hits }), "search", "q", 10, "keyword")).toMatchObject({ refs: ["a/x"], mode: null });
    expect((await akm.ask(boxFor({ hits, searchMode: "keyword" }), "search", "q")).mode).toBe("keyword");
    expect((await akm.ask(boxFor({ hits, searchMode: "semantic" }), "search", "q", 10, "keyword")).error).toContain("searched with semantic, not keyword");
  });

  test("a call that runs into its time limit is an error that says so, with timedOut set", async () => {
    const timed = await akm.ask(boxFor({ hits: [] }, 20_000), "search", "q", 10, "keyword", 700);
    expect(timed).toMatchObject({ refs: [], mode: null, error: "akm search timed out after 0.7s", timedOut: true });
    const fine = await akm.ask(boxFor({ hits: [] }), "search", "q", 10, "keyword", 30_000);
    expect(fine.timedOut).toBeUndefined();
  });
});

describe("collectionsFor", () => {
  const at = (...path: string[]) => join(ROOT, ...path);

  test("the public and rewrite corpora hold the library and the books, each scored on its own", () => {
    const pub = collectionsFor(corpusOf("public", "public", {}, at("evals", "retrieval", "assets")));
    expect(pub.map((c) => c.name)).toEqual(["library", "books"]);
    expect(pub[0].folders.library).toEndWith("/corpus/library");
    expect(pub[0].folders.assets).toEndWith("/evals/retrieval/assets");
    expect(pub[1].folders.library).toEndWith("/evals/retrieval/assets/books/library");
    expect(pub[1].folders.assets).toEndWith("/evals/retrieval/assets/books");
    expect(pub[1].folders.results).toEndWith("/evals/retrieval/results");
    const priv = collectionsFor(corpusOf("custom", "rewrite", {}, at("private", "retrieval", "assets")));
    expect(priv.map((c) => c.name)).toEqual(["library", "books"]);
    expect(priv[0].folders.library).toEndWith("/private/retrieval/assets/library");
    expect(priv[1].folders.library).toEndWith("/private/retrieval/assets/books/library");
    expect(priv[1].folders.results).toEndWith("/private/retrieval/results");
  });

  test("an own corpus is one collection in its folder, with a bundles.json beside its library, and its results go to private/retrieval/results", () => {
    const own = collectionsFor(corpusOf("custom", "own", {}, "/notes/work"));
    expect(own.map((c) => c.name)).toEqual(["own"]);
    expect(own[0].folders).toEqual({ library: "/notes/work/library", assets: "/notes/work", bundles: "/notes/work/bundles.json", results: at("private", "retrieval", "results") });
  });
});

describe("the command", () => {
  const run = (args: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-cli-"));
    dirs.push(dir);
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("single CLI runs record elapsed time and clear their running markers for both collections", () => {
    const { root, akmBin } = setup();
    const script = join(root, "fake-akm.ts");
    writeFileSync(script, readFileSync(script, "utf8").replace('const query = rest[rest.indexOf("--") + 1];', 'const query = "alpha";'));
    const label = root.split("/").at(-1) as string;
    const results = join(ROOT, "evals", "retrieval", "results");
    const day = new Date().toISOString().slice(0, 10);
    const folders = ["library", "books"].map(name => join(results, `${day}-${label}-${name}`));
    dirs.push(...folders);
    const done = run(["--corpus", "public", "--limit", "1", "--semantic", "off", "--label", label, "--akm", akmBin]);
    expect(done.code, done.err || done.out).toBe(0);
    for (const folder of folders) {
      const summary = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
      expect(summary).toMatchObject({ status: "complete", n_queries: 1, n_errored: 0, akm_version: "0.9.99-test" });
      expect(summary.wall_seconds).toBeGreaterThan(0);
      expect(existsSync(join(folder, ".running"))).toBe(false);
    }
  });

  test("takes --semantic on, off or auto, and says what else is wrong with it", () => {
    expect(run(["--semantic", "maybe"])).toMatchObject({ code: 2, err: 'retrieval: --semantic must be on, off or auto, not "maybe"\n' });
    expect(run(["--semantic"]).err).toContain("Usage: evals/retrieval/run");
  });

  test("takes --corpus public, custom or all with --cases, and says what is wrong with them", () => {
    expect(run(["--corpus", "nope"])).toMatchObject({ code: 2, err: expect.stringContaining('retrieval: --corpus must be public, custom or all, not "nope"') });
    expect(run(["--cases", "  "]).err).toContain("retrieval: --cases needs a folder");
    expect(run(["--corpus", "public", "--cases", "notes"]).err).toContain("retrieval: --cases is a custom corpus: use it alone, or with --corpus custom");
    const empty = mkdtempSync(join(tmpdir(), "retrieval-own-"));
    dirs.push(empty);
    const done = run(["--cases", empty]);
    expect(done.code).toBe(2);
    expect(done.err).toContain(`retrieval: --cases ${empty} does not hold a set in the eval's format.\nYour own set is a folder with queries.jsonl and qrels.jsonl`);
    expect(done.err).toContain("Run it with: evals/retrieval/run --cases DIR");
  });

  test("--corpus own and own-feedback need an explicit folder: the run stops with the new form", () => {
    for (const old of ["own", "own-feedback"]) {
      const done = run(["--corpus", old, "--semantic", "maybe"]);
      expect(done.code, old).toBe(2);
      expect(done.err, old).toContain(`retrieval: --corpus ${old} was renamed in 0.2: use `);
    }
    expect(run(["--corpus", "custom", "--semantic", "maybe"]).err).not.toContain("renamed");
  });

  test("lists --semantic, --akm and the own corpus in its usage, and says that a stale private set is refused", () => {
    const help = run(["--help"]).out;
    expect(help).toContain("Usage: evals/retrieval/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME] [--akm COMMAND] [--semantic on|off|auto]");
    expect(help).toContain("--semantic  on scores the semantic search too, auto (default) only in a full run of the public and rewrite corpora");
    expect(help).toContain("--akm");
    expect(help).toContain("made by ./generate-assets --only retrieval.\n            all runs public and the default custom corpus.");
  });
});

describe("AKM_BIN", () => {
  test("is pointed at the fake akm by setup(), and is the caller's again after the test", () => {
    expect(setup().akmBin).toBe(process.env.AKM_BIN as string);
    process.env.AKM_BIN = "/nonexistent/other-akm";
  });

  test("is the caller's in the test after it", () => {
    expect(process.env.AKM_BIN).toBe(callerAkmBin);
  });
});
