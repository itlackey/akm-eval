import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { collectionsFor, runCollection, withSemantic } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * What the fake akm answers to each query: the refs `search` and `curate` return, or an error, and the same for the
 * semantic index. "fallback" is a semantic search that akm answers with keyword search.
 */
type Reply = string[] | "fail" | "fallback";
const ANSWERS: Record<string, Partial<Record<"search" | "curate" | "semantic_search" | "semantic_curate", Reply>>> = {
  alpha: { search: ["a/z", "a/x", "a/q", "a/y"], curate: ["a/x", "a/y", "a/z"], semantic_search: ["a/x", "a/y", "a/z"], semantic_curate: ["a/x", "a/y", "a/z"] },
  beta: { search: [], curate: ["b/x#one", "b/x#two", "b/y"], semantic_search: ["b/y", "b/x#one"], semantic_curate: ["b/x", "b/y"] },
  gamma: { search: ["c/x"], curate: [], semantic_search: ["c/x", "c/y"], semantic_curate: [] },
  boom: { search: "fail", curate: ["d/x"], semantic_search: ["d/x"], semantic_curate: ["d/x"] },
  thanks: { search: [], curate: ["x/1"], semantic_search: ["x/1"], semantic_curate: ["x/1"] },
  "ci passed": { search: ["x/1"], curate: ["x/1"], semantic_search: ["x/1"], semantic_curate: ["x/1"] },
  fallback: { search: ["f/x"], curate: ["f/x"], semantic_search: "fallback", semantic_curate: ["f/x"] },
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
if (!a) { console.error("no answer for " + query); process.exit(1); }
const fellBack = a === "fallback";
const hits = (fellBack ? [] : a).map((ref) => ({ ref }));
const answer = { searchMode: fellBack ? "fts-fallback" : semantic ? "semantic" : "keyword", ...(fellBack ? { warnings: ["Vector search unavailable: local embedding model is unavailable (request failed)"] } : {}) };
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
  return { ctx, folders: { library, assets, results: join(root, "results") }, created, root, cacheRoot };
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
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s).toMatchObject({ eval: "retrieval", corpus: "public", collection: "library", label: "t", akm_version: "0.9.99-test", search_mode: { keyword: "keyword", semantic: "semantic" }, semantic_model: "Xenova/bge-small-en-v1.5", depth: 10, relevant_from_grade: 2, limit: null, n_queries: 6, n_assets: 1, n_scored: 3 });
    expect(Object.keys(s.index_seconds)).toEqual(["keyword", "semantic"]);

    // q1 and q2 are scored for search. q4's search call failed, so it is left out and counted.
    const dcg = 1 + 7 / Math.log2(3) + 3 / Math.log2(5);
    const ideal = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);
    expect(s.metrics.search).toMatchObject({ n: 2, p_5: 0.2, success_5: 0.5, mrr: 0.25, recall_10: 0.5, judged_10: 0.875 });
    expect(s.metrics.search.ndcg_10).toBeCloseTo(dcg / ideal / 2, 3);
    expect(s.errored).toEqual({ search: 1, curate: 0, semantic_search: 0, semantic_curate: 0 });

    // q1, q2 and q4 are all scored for curate, and curate put every relevant asset first.
    expect(s.metrics.curate).toEqual({ n: 3, ndcg_10: 1, p_5: 0.2667, success_5: 1, mrr: 1, recall_10: 1, judged_10: 1, banned_above: null });
  });

  test("counts the queries with an errored call in any column as n_errored", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s.errored.search).toBe(1);
    expect(s.n_errored).toBe(1); // q4, whose search call failed
    const clean = setup(QUERIES.filter((q) => q.id !== "q4"), QRELS.filter((r) => r.id !== "q4"));
    expect((await quiet(() => runCollection("public", "library", clean.ctx, clean.folders))).n_errored).toBe(0);
  });

  test("repeatRuns runs a collection N times into <label>-rN-<collection> and writes the spread beside them", async () => {
    const { ctx, folders } = setup();
    const runs = await quiet(() => repeatRuns(2, "t-library", (runLabel) => runCollection("public", "library", { ...ctx, label: `t-r${runLabel.slice(-1)}` }, folders)));
    expect(runs.map((r) => r.label)).toEqual(["t-r1", "t-r2"]);
    const day = new Date().toISOString().slice(0, 10);
    expect(readdirSync(folders.results).sort()).toEqual([`${day}-t-library-repeat-summary.json`, `${day}-t-r1-library`, `${day}-t-r2-library`]);
    const spread = JSON.parse(readFileSync(join(folders.results, `${day}-t-library-repeat-summary.json`), "utf8"));
    expect(spread).toMatchObject({ eval: "retrieval", repeat: 2, n_errored: { min: 1, max: 1, mean: 1 }, metrics: { search: { n: { min: 2, max: 2, mean: 2 } } } });
    expect(spread.model).toBeUndefined();
  });

  test("scores the semantic columns from the semantic index: its own answers, its own errors", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    // semantic search puts b/y, which is not relevant, before b/x for q2, and q4 answers where keyword search failed.
    expect(s.metrics.semantic_search).toMatchObject({ n: 3, p_5: 0.2667, success_5: 1, mrr: 0.8333, recall_10: 1, judged_10: 1 });
    expect(s.metrics.semantic_search?.ndcg_10).toBeCloseTo((1 + 3 / Math.log2(3) / 3 + 1) / 3, 3);
    expect(s.metrics.semantic_curate).toEqual({ n: 3, ndcg_10: 1, p_5: 0.2667, success_5: 1, mrr: 1, recall_10: 1, judged_10: 1, banned_above: null });
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[3].search.error).toContain("exited 70");
    expect(rows[3].semantic_search).toMatchObject({ refs: ["d/x"], grades: [3] });
    expect(rows[1].semantic_search.refs).toEqual(["b/y", "b/x"]); // the section of b/x folds into it
  });

  test("counts, for non-task inputs and for task queries with no relevant asset, how often akm returned nothing", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
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
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(readdirSync(s.results_dir).sort()).toEqual([".running", "samples.jsonl", "summary.json"]);
    expect(s.results_dir).toMatch(/\/\d{4}-\d{2}-\d{2}-t-library$/);
    const stored = JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.metrics.curate.n).toBe(3);

    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "q3", "q4", "n1", "n2"]);
    expect(rows[0]).toMatchObject({ id: "q1", kind: "name", query: "alpha", n_relevant: 2 });
    expect(rows[0].search).toMatchObject({ refs: ["a/z", "a/x", "a/q", "a/y"], grades: [1, 3, null, 2], scores: { p_5: 0.4, success_5: true, mrr: 0.5 } });
    expect(rows[1].curate.refs).toEqual(["b/x", "b/y"]); // the sections of b/x fold into it
    expect(rows[2]).toMatchObject({ n_relevant: 0 });
    expect(rows[2].search.scores).toBeUndefined();
    expect(rows[3].search.error).toContain("exited 70");
    expect(rows[3].search.refs).toEqual([]);
    expect(rows[4]).toMatchObject({ kind: "chitchat", n_relevant: 0 });
  });

  test("copies the library into a sandbox for the keyword index, which it removes afterwards, and into the cache for the semantic one", async () => {
    const { ctx, folders, created, cacheRoot } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
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
    await expect(quiet(() => runCollection("public", "library", without, folders))).rejects.toThrow("akm embedded 0 of 1 assets: Semantic search pending.");
    const first = setup([{ id: "f", query: "fallback", kind: "direct" }, ...QUERIES], [...QRELS, grade("f", "f/x", 3)]);
    await expect(quiet(() => runCollection("public", "library", first.ctx, first.folders))).rejects.toThrow("akm cannot search with its embedder: akm search searched with fts-fallback, not semantic");
    for (const dir of [...created, ...first.created]) expect(existsSync(dir)).toBe(false);
    expect(existsSync(first.folders.results)).toBe(false);
  });

  test("counts a semantic call that akm answered with keyword search as an error, and leaves its query out of the semantic column", async () => {
    const { ctx, folders } = setup([...QUERIES, { id: "q5", query: "fallback", kind: "direct" }], [...QRELS, grade("q5", "f/x", 3)]);
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s.errored).toEqual({ search: 1, curate: 0, semantic_search: 1, semantic_curate: 0 });
    expect(s.metrics.semantic_search?.n).toBe(3);
    expect(s.metrics.search.n).toBe(3); // q4's keyword search failed, and q5 found f/x
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[6].semantic_search.error).toContain("searched with fts-fallback, not semantic");
    expect(rows[6].search.refs).toEqual(["f/x"]);
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
        first = await runCollection("public", "library", ctx, folders);
        second = await runCollection("public", "library", ctx, folders);
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
      await quiet(() => runCollection("public", "library", ctx, folders));
      mkdirSync(join(folders.library, "skills"));
      writeFileSync(join(folders.library, "skills", "new.md"), "a new skill\n");
      const added = await quiet(() => runCollection("public", "library", ctx, folders));
      expect(added.semantic_index).toBe("cold");
      expect(added.n_assets).toBe(2);
      expect(runs(cacheRoot)).toBe(1); // from nothing
      expect(readFileSync(join(cacheRoot, "retrieval-public-library", "bundle", "skills", "new.md"), "utf8")).toBe("a new skill\n");

      writeFileSync(join(folders.library, "README.md"), "a library of one file, edited\n");
      expect((await quiet(() => runCollection("public", "library", ctx, folders))).semantic_index).toBe("cold");
      rmSync(join(folders.library, "skills"), { recursive: true });
      expect((await quiet(() => runCollection("public", "library", ctx, folders))).semantic_index).toBe("cold");
      expect((await quiet(() => runCollection("public", "library", ctx, folders))).semantic_index).toBe("warm");
    });

    test("is built again when akm says that it holds other than what it was built with, and the run says so", async () => {
      const { ctx, folders, cacheRoot } = setup();
      await quiet(() => runCollection("public", "library", ctx, folders));
      writeFileSync(join(cacheRoot, "retrieval-public-library", "data", "built-at"), "someone indexed it again");
      const { result, lines } = await printed(() => runCollection("public", "library", ctx, folders));
      expect(result.semantic_index).toBe("rebuilt");
      expect(lines.join("\n")).toContain("the index of an earlier run is not what it was built as, and a new one is built from scratch. akm said: akm says the index was built at someone indexed it again, and it was built at build 1");
      expect(runs(cacheRoot)).toBe(1);
    });

    test("keeps an index for each collection, and none for a run without the semantic search", async () => {
      const { ctx, folders, cacheRoot } = setup();
      await quiet(() => runCollection("public", "library", ctx, folders));
      await quiet(() => runCollection("public", "books", ctx, folders));
      await quiet(() => runCollection("private", "books", ctx, folders));
      expect(readdirSync(cacheRoot).sort()).toEqual(["retrieval-private-books", "retrieval-public-books", "retrieval-public-library"]);
      const keyword = setup();
      await quiet(() => runCollection("public", "library", { ...keyword.ctx, semantic: false }, keyword.folders));
      expect(existsSync(keyword.cacheRoot)).toBe(false);
    });
  });

  test("without the semantic index, makes one sandbox and has the keyword columns only", async () => {
    const { ctx, folders, created, root } = setup();
    const { result: s, lines } = await printed(() => runCollection("public", "library", { ...ctx, semantic: false }, folders));
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
    const s = await quiet(() => runCollection("public", "library", { ...ctx, semantic: false }, folders));
    expect(s.metrics.search.n).toBe(3);
  });

  test("scores the semantic search in a full run of the public and private corpora, and not with --limit or in the own corpus", () => {
    expect(withSemantic("public")).toBe(true);
    expect(withSemantic("private")).toBe(true);
    expect(withSemantic("public", 20)).toBe(false);
    expect(withSemantic("private", 1)).toBe(false);
    expect(withSemantic("own")).toBe(false);
    expect(withSemantic("own", 20)).toBe(false);
  });

  test("runs N queries, in the task and non-task proportion, with --limit", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", { ...ctx, limit: 3 }, folders));
    expect(s).toMatchObject({ limit: 3, n_queries: 3 });
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "n1"]);
  });

  test("starts a second results folder when the first exists, and uses akm's version for a default label", async () => {
    const { ctx, folders } = setup();
    const a = await quiet(() => runCollection("public", "library", ctx, folders));
    const b = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(b.results_dir).toBe(`${a.results_dir}-2`);
    const c = await quiet(() => runCollection("public", "library", { newSandbox: ctx.newSandbox, semantic: true, cache: ctx.cache }, folders));
    expect(c.label).toBe("akm-0.9.99-test");
    expect(c.results_dir).toMatch(/-akm-0\.9\.99-test-library$/);
  });

  test("refuses a task query that has no grades, and removes nothing it did not make", async () => {
    const { ctx, folders } = setup(QUERIES, QRELS.filter((r) => r.id !== "q4"));
    await expect(quiet(() => runCollection("public", "library", ctx, folders))).rejects.toThrow("q4 has no grades in qrels.jsonl. Run evals/retrieval/label first.");
    expect(existsSync(folders.results)).toBe(false);
    await expect(quiet(() => runCollection("public", "books", ctx, folders))).rejects.toThrow(/^q4 has no grades in qrels.jsonl.$/);
  });

  test("reports a run with no query that has a relevant asset as empty numbers, not as zeros", async () => {
    const { ctx, folders } = setup([QUERIES[2], QUERIES[4]], [grade("q3", "c/x", 1)]);
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s.n_scored).toBe(0);
    expect(s.metrics.search.ndcg_10).toBeNull();
    expect(s.metrics.semantic_search?.ndcg_10).toBeNull();
    expect(s.abstention.no_answer.search.n).toBe(1);
  });
});

describe("banned assets", () => {
  // q1 bans a/z, which search puts first. q2 bans b/y, which curate puts after b/x, and search returns nothing.
  const queries = QUERIES.slice(0, 2);
  const qrels = [grade("q1", "a/x", 3), grade("q1", "a/y", 2), { ...grade("q1", "a/z", 0), banned: true }, grade("q2", "b/x", 2), { ...grade("q2", "b/y", 0), banned: true }];

  test("counts the queries where a banned asset ranks above a relevant one", async () => {
    const { ctx, folders } = setup(queries, qrels);
    const s = await quiet(() => runCollection("public", "books", ctx, folders));
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
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
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
    const s = await quiet(() => runCollection("own", "own", ctx, { ...folders, library, bundles }));
    expect(s).toMatchObject({ corpus: "own", collection: "own", n_assets: 2 }); // had the library been copied as well, the fake akm would count 4
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
    const first = await quiet(() => runCollection("own", "own", ctx, own));
    const second = await quiet(() => runCollection("own", "own", ctx, own));
    expect([first.semantic_index, second.semantic_index]).toEqual(["cold", "warm"]);
    expect(existsSync(join(cacheRoot, "retrieval-own", "bundle", "one"))).toBe(false); // nothing is copied
    writeFileSync(join(library, "one", "b.md"), "b\n");
    expect((await quiet(() => runCollection("own", "own", ctx, own))).semantic_index).toBe("cold"); // a file that is new
    writeFileSync(join(library, "one", "a.md"), "a, edited\n");
    expect((await quiet(() => runCollection("own", "own", ctx, own))).semantic_index).toBe("cold");
    writeFileSync(bundles, JSON.stringify({ one: "claude" })); // the same files with another adapter are another index
    expect((await quiet(() => runCollection("own", "own", ctx, own))).semantic_index).toBe("cold");
    expect((await quiet(() => runCollection("own", "own", ctx, own))).semantic_index).toBe("warm");
  });

  test("copies a library without bundles.json into the sandbox as one bundle, and follows a link to it", async () => {
    const { ctx, folders, root } = setup();
    const link = join(root, "link");
    symlinkSync(folders.library, link);
    const s = await quiet(() => runCollection("own", "own", ctx, { ...folders, library: link, bundles: join(root, "missing.json") }));
    expect(s.n_assets).toBe(1);
    expect(JSON.parse(readFileSync(join(root, "seen-config-keyword.json"), "utf8")).bundles).toBeUndefined();
    expect(JSON.parse(readFileSync(join(root, "seen-config-semantic.json"), "utf8")).bundles).toBeUndefined();
  });

  test("says how to make a set when the queries are not in the eval's format", async () => {
    const { ctx, folders } = setup([{ qid: "q1", query: "alpha", class: "task" }] as never);
    await expect(quiet(() => runCollection("own", "own", ctx, folders))).rejects.toThrow(/has no string "id"\n.*private\/retrieval\/own\/: queries.jsonl and qrels.jsonl/s);
    await expect(quiet(() => runCollection("public", "library", ctx, folders))).rejects.toThrow(/^[^\n]*has no string "id"$/);
  });
});

describe("collectionsFor", () => {
  test("public and private corpora hold the library and the books, each scored on its own", () => {
    const pub = collectionsFor("public");
    expect(pub.map((c) => c.name)).toEqual(["library", "books"]);
    expect(pub[0].folders.library).toEndWith("/corpus/library");
    expect(pub[0].folders.assets).toEndWith("/evals/retrieval/assets");
    expect(pub[1].folders.library).toEndWith("/evals/retrieval/assets/books/library");
    expect(pub[1].folders.assets).toEndWith("/evals/retrieval/assets/books");
    expect(pub[1].folders.results).toEndWith("/evals/retrieval/results");
    const priv = collectionsFor("private");
    expect(priv.map((c) => c.name)).toEqual(["library", "books"]);
    expect(priv[0].folders.library).toEndWith("/private/retrieval/assets/library");
    expect(priv[1].folders.library).toEndWith("/private/retrieval/assets/books/library");
    expect(priv[1].folders.results).toEndWith("/private/retrieval/results");
  });

  test("the own corpus is one collection in private/retrieval/own, with a bundles.json beside its library", () => {
    const own = collectionsFor("own");
    expect(own.map((c) => c.name)).toEqual(["own"]);
    expect(own[0].folders.assets).toEndWith("/private/retrieval/own");
    expect(own[0].folders.library).toEndWith("/private/retrieval/own/library");
    expect(own[0].folders.bundles).toEndWith("/private/retrieval/own/bundles.json");
    expect(own[0].folders.results).toEndWith("/private/retrieval/results");
  });
});
