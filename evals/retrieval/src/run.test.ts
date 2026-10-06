import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import { collectionsFor, runCollection } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** What the fake akm answers to each query: the refs `search` and `curate` return, or an error. */
const ANSWERS: Record<string, { search: string[] | "fail"; curate: string[] | "fail" }> = {
  alpha: { search: ["a/z", "a/x", "a/q", "a/y"], curate: ["a/x", "a/y", "a/z"] },
  beta: { search: [], curate: ["b/x#one", "b/x#two", "b/y"] },
  gamma: { search: ["c/x"], curate: [] },
  boom: { search: "fail", curate: ["d/x"] },
  thanks: { search: [], curate: ["x/1"] },
  "ci passed": { search: ["x/1"], curate: ["x/1"] },
};

/**
 * An akm that counts the files of the sandbox's bundle, and of every bundle its config names, as its entries, and
 * answers each query from the table above. It writes the config it was indexed with to `seen-config.json`.
 */
const fakeAkm = (dir: string) => `
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const answers = ${JSON.stringify(ANSWERS)};
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (cmd === "index") {
  const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
  writeFileSync(${JSON.stringify(join(dir, "seen-config.json"))}, JSON.stringify(config));
  const folders = [process.env.AKM_BUNDLE_DIR, ...Object.values(config.bundles ?? {}).map((b) => b.path)];
  console.log(JSON.stringify({ ok: true, totalEntries: folders.reduce((n, f) => n + readdirSync(f).length, 0) }));
  process.exit(0);
}
const query = rest[rest.indexOf("--") + 1];
const a = answers[query]?.[cmd];
if (a === "fail") { console.error("boom"); process.exit(70); }
if (!a) { console.error("no answer for " + query); process.exit(1); }
const hits = a.map((ref) => ({ ref }));
console.log(JSON.stringify(cmd === "search" ? { hits, searchMode: "keyword" } : { items: hits, searchMode: "keyword" }));
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
  return { ctx: { newSandbox, label: "t" }, folders: { library, assets, results: join(root, "results") }, created, root };
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

describe("runCollection", () => {
  test("scores search and curate on the task queries that have a relevant asset", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s).toMatchObject({ eval: "retrieval", corpus: "public", collection: "library", label: "t", akm_version: "0.9.99-test", search_mode: "keyword", depth: 10, relevant_from_grade: 2, limit: null, n_queries: 6, n_assets: 1, n_scored: 3 });

    // q1 and q2 are scored for search. q4's search call failed, so it is left out and counted.
    const dcg = 1 + 7 / Math.log2(3) + 3 / Math.log2(5);
    const ideal = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);
    expect(s.metrics.search).toMatchObject({ n: 2, p_5: 0.2, success_5: 0.5, mrr: 0.25, recall_10: 0.5, judged_10: 0.875 });
    expect(s.metrics.search.ndcg_10).toBeCloseTo(dcg / ideal / 2, 3);
    expect(s.errored).toEqual({ search: 1, curate: 0 });

    // q1, q2 and q4 are all scored for curate, and curate put every relevant asset first.
    expect(s.metrics.curate).toEqual({ n: 3, ndcg_10: 1, p_5: 0.2667, success_5: 1, mrr: 1, recall_10: 1, judged_10: 1, banned_above: null });
  });

  test("counts, for non-task inputs and for task queries with no relevant asset, how often akm returned nothing", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s.abstention.non_task).toEqual({ search: { n: 2, abstained: 1, rate: 0.5 }, curate: { n: 2, abstained: 0, rate: 0 } });
    expect(s.abstention.no_answer).toEqual({ search: { n: 1, abstained: 0, rate: 0 }, curate: { n: 1, abstained: 1, rate: 1 } });
  });

  test("writes summary.json and samples.jsonl: what akm returned, each result's grade, and the scores", async () => {
    const { ctx, folders } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(readdirSync(s.results_dir).sort()).toEqual(["samples.jsonl", "summary.json"]);
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

  test("copies the library into the sandbox, and removes the sandbox afterwards", async () => {
    const { ctx, folders, created } = setup();
    const s = await quiet(() => runCollection("public", "library", ctx, folders));
    expect(s.n_assets).toBe(1); // the fake akm counts the files in the bundle: the library's one file
    expect(created).toHaveLength(1);
    expect(existsSync(created[0])).toBe(false);
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
    const c = await quiet(() => runCollection("public", "library", { newSandbox: ctx.newSandbox }, folders));
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
    const seen = JSON.parse(readFileSync(join(root, "seen-config.json"), "utf8"));
    expect(seen.semanticSearchMode).toBe("off");
    expect(seen.defaultBundle).toBeUndefined();
    expect(seen.bundles).toEqual({
      one: { path: join(realpathSync(library), "one"), components: { main: { adapter: "akm" } }, writable: false },
      two: { path: join(realpathSync(library), "two"), components: { main: { adapter: "claude" } }, writable: false },
    });
  });

  test("copies a library without bundles.json into the sandbox as one bundle, and follows a link to it", async () => {
    const { ctx, folders, root } = setup();
    const link = join(root, "link");
    symlinkSync(folders.library, link);
    const s = await quiet(() => runCollection("own", "own", ctx, { ...folders, library: link, bundles: join(root, "missing.json") }));
    expect(s.n_assets).toBe(1);
    expect(JSON.parse(readFileSync(join(root, "seen-config.json"), "utf8")).bundles).toBeUndefined();
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
