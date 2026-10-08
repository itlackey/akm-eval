import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { akmVersion } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { type Corpus, publicCorpus } from "./dataset.ts";
import { type Split, fakeAkmScript, sandboxRunning, writeAssets } from "./fakes.ts";
import { CURATE_CHECK, curateSample, runCorpus, withSemantic } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "skillret-run-"));
  dirs.push(d);
  return d;
};

const TEST: Split = {
  skills: [
    ["t1", "git commit messages review staged changes"],
    ["t2", "docker container compose networking"],
    ["t3", "postgres database migration schema"],
    ["t4", "react component hooks state"],
    ["t5", "kubernetes deployment helm charts"],
    ["t6", "python testing pytest fixtures"],
  ],
  queries: [
    ["q1", "review my staged changes and write commit messages", ["t1"]],
    ["q2", "compose containers with docker and migrate the postgres database schema", ["t2", "t3"]],
    ["q3", "react hooks, helm charts on kubernetes deployment", ["t4", "t5", "t6"]],
    ["q4", "docker networking", ["t2"]],
  ],
};
const TRAIN: Split = { skills: [["s1", "train skill"]], queries: [["p1", "a request", ["s1"]]] };

/** The tiny corpus, a fake akm for it, and a place for the results. */
function setup() {
  const root = tmp();
  const assets = join(root, "assets");
  writeAssets(assets, TEST, TRAIN);
  const script = fakeAkmScript(root);
  const cacheRoot = join(root, "index-cache");
  const sandboxes: string[] = [];
  /** A sandbox whose akm is a script. The folder goes into `sandboxes`, to check that a run removes it, and is removed after the test anyway. */
  const sandboxRunningScript = (akmScript: string, semantic = false) => {
    const sandbox = sandboxRunning(akmScript, sandboxes, semantic);
    dirs.push(sandbox.dir);
    return sandbox;
  };
  /** What runCorpus is given: the fake akm for the keyword sandbox and for the cached semantic index, which is in the temp folder. */
  const ctx = (more: Partial<Parameters<typeof runCorpus>[1]> = {}): Parameters<typeof runCorpus>[1] => ({ semantic: true, newSandbox: () => sandboxRunningScript(script), cache: { root: cacheRoot, cmd: ["bun", script] }, ...more });
  return { root, assets, results: join(root, "results"), script, cacheRoot, sandboxes, sandboxRunningScript, ctx, newSandbox: (semantic = false) => sandboxRunningScript(script, semantic), corpus: publicCorpus(assets) };
}

/** Runs `f` and returns what it printed, on stdout and on stderr. */
const logged = async <T>(f: () => Promise<T>): Promise<{ result: T; lines: string[] }> => {
  const { log, error } = console;
  const lines: string[] = [];
  console.log = console.error = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    return { result: await f(), lines };
  } finally {
    console.log = log;
    console.error = error;
  }
};

describe("akm", () => {
  test("loads each skill as skills/<id>/SKILL.md, as the dataset has it, and says how many assets akm found", async () => {
    const s = setup();
    const sb = s.newSandbox();
    expect(await akmVersion(sb)).toBe("0.9.99-test");
    expect(await akm.load(sb, s.corpus.skills)).toBe(6);
    expect(readdirSync(join(sb.dir, "bundle", "skills")).sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(readFileSync(join(sb.dir, "bundle", "skills", "t3", "SKILL.md"), "utf8")).toBe("postgres database migration schema");
  });

  test("a semantic index has to hold an embedding of every skill", async () => {
    const s = setup();
    const sb = s.newSandbox(true);
    expect(await akm.load(sb, s.corpus.skills, true)).toBe(6);
    const left = s.newSandbox(true);
    await expect(akm.load(left, [...s.corpus.skills.slice(1), { id: "t7", text: "NOEMBED the skill akm leaves out" }], true)).rejects.toThrow("akm embedded 5 of 6 skills: embedded");
    // a keyword index holds none, and that is as it should be
    expect(await akm.load(s.newSandbox(), s.corpus.skills)).toBe(6);
  });

  test("asks for the deepest cut-off and returns skill ids", async () => {
    const s = setup();
    const sb = s.newSandbox();
    await akm.load(sb, s.corpus.skills);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    for (const system of ["search", "curate"] as const) {
      expect(await akm.ask(sb, system, "compose containers with docker and migrate the postgres database schema", known)).toMatchObject({ ranked: ["t3", "t2"], mode: "keyword" });
    }
    expect((await akm.ask(sb, "search", "nothing matches xyz", known)).ranked).toEqual([]);
  });

  test("a semantic answer says so, and has every skill, as a vector search finds neighbours of any query", async () => {
    const s = setup();
    const sb = s.newSandbox(true);
    await akm.load(sb, s.corpus.skills, true);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    for (const system of ["search", "curate"] as const) {
      expect(await akm.ask(sb, system, "compose containers with docker and migrate the postgres database schema", known, "semantic")).toMatchObject({ ranked: ["t3", "t2", "t6", "t5", "t4", "t1"], mode: "semantic" });
    }
    expect((await akm.ask(sb, "search", "nothing matches xyz", known, "semantic")).ranked).toHaveLength(6);
  });

  test("an answer that searched another way than it was asked to is a failure: akm falls back to keyword search when it cannot embed", async () => {
    const s = setup();
    const semantic = s.newSandbox(true);
    const keyword = s.newSandbox();
    await akm.load(semantic, s.corpus.skills, true);
    await akm.load(keyword, s.corpus.skills);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    const fell = await akm.ask(semantic, "search", "FALLBACK docker networking", known, "semantic");
    expect(fell.ranked).toEqual([]);
    expect(fell.error).toContain("akm search searched with fts-fallback, not semantic: [\"Vector search unavailable");
    expect((await akm.ask(keyword, "curate", "docker networking", known, "semantic")).error).toContain("akm curate searched with keyword, not semantic");
    expect((await akm.ask(semantic, "curate", "docker networking", known)).error).toContain("akm curate searched with semantic, not keyword");
  });

  test("asks a call again that failed, and gives up on one that fails twice", async () => {
    const s = setup();
    const sb = s.newSandbox();
    await akm.load(sb, s.corpus.skills);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    const flaky = await akm.ask(sb, "search", "FLAKY docker networking", known);
    expect(flaky).toMatchObject({ ranked: ["t2"], mode: "keyword" });
    expect(flaky.error).toBeUndefined();
    const broken = await akm.ask(sb, "curate", "BROKEN docker networking", known);
    expect(broken.ranked).toEqual([]);
    expect(broken.error).toContain("akm curate exited 70: boom");
  });

  test("treats a result that is not one of the skills as a failure", async () => {
    const s = setup();
    const sb = s.newSandbox();
    await akm.load(sb, s.corpus.skills);
    const stray = await akm.ask(sb, "search", "STRAY", new Set(["t1"]));
    expect(stray.ranked).toEqual([]);
    expect(stray.error).toContain('"skills/not-a-skill", which is not one of the skills it was given');
  });
});

describe("runCorpus", () => {
  test("writes every skill, asks search of both indexes for every query, scores it and writes the results", async () => {
    const s = setup();
    const { result: summary, lines } = await logged(() => runCorpus(s.corpus, s.ctx({ label: "t", workers: 3 }), { assets: s.assets, results: s.results }));
    const dir = join(s.results, readdirSync(s.results)[0]);
    expect(dir).toMatch(/\d{4}-\d\d-\d\d-t$/);
    expect(readdirSync(dir).sort()).toEqual([".running", "samples.jsonl", "summary.json"]);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ eval: "skillret", corpus: "public", label: "t", akm_version: "0.9.99-test", search_mode: { keyword: "keyword", semantic: "semantic" }, semantic_model: "Xenova/bge-small-en-v1.5", depth: 15, workers: 3, n_skills: 6, n_queries: 4 });
    expect(stored.errored).toEqual({ search: 0, semantic_search: 0 });
    expect(stored.no_results).toEqual({ search: 0, semantic_search: 0 });
    expect(Object.keys(stored.index_seconds)).toEqual(["keyword", "semantic"]);
    expect(Object.keys(stored.metrics)).toEqual(["search", "semantic_search"]);
    expect(Object.keys(stored.call_seconds)).toEqual(["search", "semantic_search"]);
    expect(stored.dataset).toMatchObject({ revision: "r".repeat(40), sha256: { "test-skills.jsonl": expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(stored.sample).toMatchObject({ split: "test", limit: null, n_queries: 4 });
    expect(summary.results_dir).toBe(dir);
    expect(stored.results_dir).toBeUndefined();

    // q1, q2 and q4 are found completely. q3 needs three skills and the query names words of two of them.
    expect(stored.metrics.search).toMatchObject({ "Completeness@5": 0.75, "Completeness@10": 0.75, "Completeness@15": 0.75, "Recall@5": 0.9167, "MAP@5": 0.9167 });
    expect(stored.metrics.search["NDCG@5"]).toBeCloseTo((3 + (1 + 1 / Math.log2(3)) / (1 + 1 / Math.log2(3) + 0.5)) / 4, 4);
    // The semantic search returns every skill, the ones that share no word with the query last, so it finds t6 for q3 too.
    for (const [name, value] of Object.entries(stored.metrics.semantic_search)) expect([name, value]).toEqual([name, 1]);
    expect(stored.by_size["1"]).toMatchObject({ n: 2, search: { "Completeness@5": 1, "NDCG@10": 1 } });
    expect(stored.by_size["2"]).toMatchObject({ n: 1, semantic_search: { "Completeness@5": 1 } });
    expect(stored.by_size["3"]).toMatchObject({ n: 1, search: { "Completeness@15": 0, "Recall@15": 0.6667 }, semantic_search: { "Completeness@5": 1 } });
    // There are fewer queries than the curate check takes, so it takes all of them, and curate answered like search on both indexes.
    expect(stored.curate_check).toEqual({ seed: 42, queries: ["q1", "q2", "q3", "q4"], keyword: { compared: 4, same: 4, different: [], errored: 0 }, semantic: { compared: 4, same: 4, different: [], errored: 0 } });

    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(rows[1]).toMatchObject({ relevant: ["t2", "t3"], search: { ranked: ["t3", "t2"] }, curate: { ranked: ["t3", "t2"] }, semantic_search: { ranked: ["t3", "t2", "t6", "t5", "t4", "t1"] }, semantic_curate: { ranked: ["t3", "t2", "t6", "t5", "t4", "t1"] } });
    expect(rows[2].search.ranked).toEqual(["t5", "t4"]);
    expect(rows[2].semantic_search.ranked.slice(0, 3)).toEqual(["t5", "t4", "t6"]);

    const table = lines.join("\n");
    expect(table).toContain("akm search, semantic");
    expect(table).not.toMatch(/^ +akm curate/m);
    expect(table).toContain("curate check: on 4 queries (seed 42) akm curate returned search's ranking on the keyword index and on the semantic index");
    expect(table).not.toContain("DIFFERS");
    expect(table).toContain("published by SkillRet");
    expect(table.indexOf("indexed for semantic search")).toBeLessThan(table.indexOf("indexed for keyword search"));
    expect(table).toContain("BM25");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("gives the same rankings with one worker as with several", async () => {
    const s = setup();
    const run = async (workers: number) => {
      await logged(() => runCorpus(s.corpus, s.ctx({ label: `w${workers}`, workers }), { assets: s.assets, results: s.results }));
      const dir = readdirSync(s.results).find((d) => d.endsWith(`w${workers}`)) as string;
      return readFileSync(join(s.results, dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.search.ranked, r.semantic_search.ranked]);
    };
    expect(await run(1)).toEqual(await run(4));
  });

  test("with a limit, prints no published numbers, which are for the whole public split", async () => {
    const s = setup();
    const corpus = publicCorpus(s.assets, 2);
    const { lines } = await logged(() => runCorpus(corpus, s.ctx({ label: "l", limit: 2, semantic: false }), { assets: s.assets, results: s.results }));
    expect(lines.join("\n")).not.toContain("published by SkillRet");
    expect(JSON.parse(readFileSync(join(s.results, readdirSync(s.results)[0], "summary.json"), "utf8"))).toMatchObject({ n_queries: 2, sample: { limit: 2 } });
  });

  test("a run without the semantic index has one sandbox, one line, and no semantic fields", async () => {
    const s = setup();
    const { result: summary, lines } = await logged(() => runCorpus(s.corpus, s.ctx({ label: "k", semantic: false }), { assets: s.assets, results: s.results }));
    expect(s.sandboxes).toHaveLength(1);
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.search_mode).toEqual({ keyword: "keyword" });
    expect(Object.keys(stored.index_seconds)).toEqual(["keyword"]);
    expect(Object.keys(stored.metrics)).toEqual(["search"]);
    expect(Object.keys(stored.errored)).toEqual(["search"]);
    expect(Object.keys(stored.call_seconds)).toEqual(["search"]);
    expect(Object.keys(stored.by_size["1"]).sort()).toEqual(["n", "search"]);
    expect(stored.semantic_model).toBeUndefined();
    expect(stored.curate_check).toEqual({ seed: 42, queries: ["q1", "q2", "q3", "q4"], keyword: { compared: 4, same: 4, different: [], errored: 0 } });
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["curate", "id", "query", "relevant", "search"]);
    const table = lines.join("\n");
    expect(table).not.toContain("semantic");
    expect(table).toContain("curate check: on 4 queries (seed 42) akm curate returned search's ranking on the keyword index");
    expect(table).not.toContain("indexed for semantic search");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("says loudly when curate does not return search's ranking, and records which queries", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, queries: [...s.corpus.queries, { id: "cd", query: "CURATEDIFF compose containers with docker and migrate the postgres database schema", relevant: ["t2", "t3"] }] };
    const { result: summary, lines } = await logged(() => runCorpus(corpus, s.ctx({ label: "d" }), { assets: s.assets, results: s.results }));
    expect(summary.curate_check.keyword).toEqual({ compared: 5, same: 4, different: ["cd"], errored: 0 });
    expect(summary.curate_check.semantic).toEqual({ compared: 5, same: 4, different: ["cd"], errored: 0 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.curate_check.keyword.different).toEqual(["cd"]);
    const table = lines.join("\n");
    expect(table).toContain("!!! CURATE DIFFERS FROM SEARCH on the keyword index: 1 of 5 checked queries, cd");
    expect(table).toContain("!!! CURATE DIFFERS FROM SEARCH on the semantic index: 1 of 5 checked queries, cd");
    expect(table).toContain("the curate lines have to come back");
    expect(table).not.toContain("curate check: on");
  });

  describe("the semantic index kept between runs", () => {
    const rankings = (dir: string) => readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.search.ranked, r.semantic_search.ranked]);
    const folders = (s: ReturnType<typeof setup>) => ({ assets: s.assets, results: s.results });
    const runs = (s: ReturnType<typeof setup>) => readFileSync(join(s.cacheRoot, "skillret-public", "data", "index-runs"), "utf8").length;

    test("is used as it is by the next run, which has the same rankings, and akm does not index it again", async () => {
      const s = setup();
      const first = await logged(() => runCorpus(s.corpus, s.ctx({ label: "one" }), folders(s)));
      const second = await logged(() => runCorpus(s.corpus, s.ctx({ label: "two" }), folders(s)));
      expect(first.result.semantic_index).toBe("cold");
      expect(second.result.semantic_index).toBe("warm");
      expect(JSON.parse(readFileSync(join(second.result.results_dir, "summary.json"), "utf8")).semantic_index).toBe("warm");
      expect(runs(s)).toBe(1); // akm indexed there once: an index that is indexed again is not the index that was built
      expect(first.lines.join("\n")).toMatch(/indexed for semantic search in \d+ s: a new index\n/);
      expect(second.lines.join("\n")).toMatch(/indexed for semantic search in \d+ s: kept from an earlier run\n/);
      expect(second.lines.join("\n")).toMatch(/index \d+ s for keyword search and \d+ s for semantic \(kept from an earlier run\)/);
      expect(rankings(second.result.results_dir)).toEqual(rankings(first.result.results_dir));
      expect(readdirSync(s.cacheRoot)).toEqual(["skillret-public"]); // and nothing is locked
    });

    test("is built again when a skill changed, is gone or is new", async () => {
      const s = setup();
      await logged(() => runCorpus(s.corpus, s.ctx(), folders(s)));
      const more: Corpus = { ...s.corpus, skills: [...s.corpus.skills, { id: "t7", text: "rust cargo workspace crates" }] };
      const added = await logged(() => runCorpus(more, s.ctx(), folders(s)));
      expect(added.result.semantic_index).toBe("cold");
      expect(added.lines.join("\n")).toContain("the index skillret-public in the cache cannot be reused: 0 of its 6 files changed or are gone, and 1 are new");
      expect(runs(s)).toBe(1); // from nothing

      const edited: Corpus = { ...more, skills: more.skills.map((x) => (x.id === "t2" ? { ...x, text: `${x.text} and swarm` } : x)) };
      const changed = await logged(() => runCorpus(edited, s.ctx(), folders(s)));
      expect(changed.result.semantic_index).toBe("cold");
      expect(changed.lines.join("\n")).toContain("1 of its 7 files changed or are gone, and 0 are new");

      const gone: Corpus = { ...edited, skills: edited.skills.slice(1) };
      expect((await logged(() => runCorpus(gone, s.ctx(), folders(s)))).result.semantic_index).toBe("cold");
      expect((await logged(() => runCorpus(gone, s.ctx(), folders(s)))).result.semantic_index).toBe("warm");
    });

    test("is built again when akm says that it holds other than what it was built with, and the run says so", async () => {
      const s = setup();
      await logged(() => runCorpus(s.corpus, s.ctx(), folders(s)));
      rmSync(join(s.cacheRoot, "skillret-public", "bundle", "skills", "t3"), { recursive: true }); // the fake akm counts the skills of the bundle
      const again = await logged(() => runCorpus(s.corpus, s.ctx(), folders(s)));
      expect(again.result.semantic_index).toBe("rebuilt");
      expect(again.lines.join("\n")).toContain("the index of an earlier run is not what it was built as, and a new one is built from scratch. akm said: akm says the index holds 5 assets, and it was built with 6");
      expect(again.lines.join("\n")).toContain("a new index, because the kept one was not what it was built as");
      expect(runs(s)).toBe(1);
      expect(readdirSync(join(s.cacheRoot, "skillret-public", "bundle", "skills")).sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    });

    test("is not made, and not touched, by a run without the semantic search", async () => {
      const s = setup();
      await logged(() => runCorpus(s.corpus, s.ctx({ semantic: false }), folders(s)));
      expect(existsSync(s.cacheRoot)).toBe(false);
    });

    test("is not kept when the run stops because akm did not index every skill", async () => {
      const s = setup();
      const short = join(s.root, "short-akm.ts");
      writeFileSync(short, 'const [cmd] = process.argv.slice(2); if (cmd === "--version") console.log("0.9.99-test"); else console.log(JSON.stringify({ totalEntries: 5, verification: { embeddingCount: 5 } }));');
      await logged(() => runCorpus(s.corpus, s.ctx({ cache: { root: s.cacheRoot, cmd: ["bun", short] } }), folders(s))).catch(() => {});
      expect(readdirSync(s.cacheRoot)).toEqual([]);
    });
  });

  test("scores the semantic search in a full run, and not with --limit", () => {
    expect(withSemantic()).toBe(true);
    expect(withSemantic(200)).toBe(false);
    expect(withSemantic(1)).toBe(false);
  });

  test("the curate check asks about 200 of the queries, drawn under the seed, and all of them when there are fewer", () => {
    const queries = Array.from({ length: 300 }, (_, i) => ({ id: `q${i}`, query: `query ${i}`, relevant: ["t1"] }));
    const sample = curateSample(queries);
    expect(CURATE_CHECK).toBe(200);
    expect(sample).toHaveLength(200);
    expect(new Set(sample.map((q) => q.id)).size).toBe(200);
    expect(curateSample(queries)).toEqual(sample);
    expect(sample.map((q) => q.id)).not.toEqual(queries.slice(0, 200).map((q) => q.id));
    const order = sample.map((q) => queries.indexOf(q));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(curateSample(queries.slice(0, 50))).toEqual(queries.slice(0, 50));
  });

  test("counts a failed call and leaves its query out, and counts an empty answer as a query that scored 0", async () => {
    const s = setup();
    const corpus: Corpus = {
      ...s.corpus,
      queries: [
        { id: "ok", query: "docker networking", relevant: ["t2"] },
        { id: "flaky", query: "FLAKY docker networking", relevant: ["t2"] },
        { id: "broken", query: "BROKEN docker networking", relevant: ["t2"] },
        { id: "stray", query: "STRAY", relevant: ["t2"] },
        { id: "empty", query: "EMPTY docker networking", relevant: ["t2"] },
      ],
    };
    const { result: summary, lines } = await logged(() => runCorpus(corpus, s.ctx({ workers: 2 }), { assets: s.assets, results: s.results }));
    expect(summary.label).toBe("akm-0.9.99-test");
    expect(summary.errored).toEqual({ search: 2, semantic_search: 2 });
    expect(summary.no_results).toEqual({ search: 1, semantic_search: 1 });
    // ok and flaky score 1, empty scores 0, broken and stray are left out
    expect(summary.metrics.search["Recall@5"]).toBe(0.6667);
    expect(summary.metrics.semantic_search?.["Recall@5"]).toBe(0.6667);
    // The curate calls of broken and stray failed too, and those queries were not compared. The other three were, and agree.
    expect(summary.curate_check.keyword).toEqual({ compared: 3, same: 3, different: [], errored: 2 });
    expect(summary.curate_check.semantic).toEqual({ compared: 3, same: 3, different: [], errored: 2 });
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.id === "broken").curate.error).toContain("exited 70");
    expect(rows.find((r) => r.id === "flaky").search.error).toBeUndefined();
    expect(lines.join("\n")).toContain("errored calls: akm search 2");
    expect(lines.join("\n")).toContain("errored calls: akm search, semantic 2");
    expect(lines.join("\n")).toContain("curate check: 2 curate calls on the semantic index failed");
  });

  test("stops when akm indexes fewer assets than there are skills", async () => {
    const s = setup();
    const broken = join(s.root, "short-akm.ts");
    writeFileSync(broken, 'const [cmd] = process.argv.slice(2); if (cmd === "--version") console.log("0.9.99-test"); else console.log(JSON.stringify({ totalEntries: 5, verification: { embeddingCount: 5 } }));');
    const failure = await logged(() => runCorpus(s.corpus, s.ctx({ newSandbox: () => s.sandboxRunningScript(broken), cache: { root: s.cacheRoot, cmd: ["bun", broken] } }), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((failure as Error).message).toContain("akm indexed 5 assets for 6 skills");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("stops before the queries when akm cannot embed the skills, or answers a first semantic search with keyword search", async () => {
    const s = setup();
    const withoutEmbeddings = join(s.root, "no-embeddings-akm.ts");
    writeFileSync(withoutEmbeddings, 'const [cmd] = process.argv.slice(2); if (cmd === "--version") console.log("0.9.99-test"); else console.log(JSON.stringify({ totalEntries: 6, verification: { embeddingCount: 0, message: "Semantic search pending." } }));');
    const first = await logged(() => runCorpus(s.corpus, s.ctx({ newSandbox: () => s.sandboxRunningScript(withoutEmbeddings), cache: { root: s.cacheRoot, cmd: ["bun", withoutEmbeddings] } }), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((first as Error).message).toContain("akm embedded 0 of 6 skills: Semantic search pending.");
    const corpus: Corpus = { ...s.corpus, queries: [{ id: "q", query: "FALLBACK docker networking", relevant: ["t2"] }, ...s.corpus.queries] };
    const second = await logged(() => runCorpus(corpus, s.ctx(), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((second as Error).message).toContain("akm cannot search with its embedder: akm search searched with fts-fallback, not semantic");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("stops with a message when akm cannot be run", async () => {
    const s = setup();
    const failure = await logged(() => runCorpus(s.corpus, s.ctx({ newSandbox: () => ({ ...s.sandboxRunningScript(s.script), cmd: ["/nonexistent/akm"] }) }), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((failure as Error).message).toContain("could not run");
  });
});

describe("the command line", () => {
  const run = (...args: string[]) => {
    const r = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test("says what it runs with --help", () => {
    const r = run("--help");
    expect(r.code).toBe(0);
    expect(r.out).toContain("--corpus  public (default)");
  });

  test("refuses a corpus, a limit and a label it does not know", () => {
    expect(run("--corpus", "everything")).toMatchObject({ code: 2, err: expect.stringContaining('--corpus must be public, private or all, not "everything"') });
    expect(run("--limit", "0")).toMatchObject({ code: 2, err: expect.stringContaining("--limit must be a positive integer") });
    expect(run("--limit", "ten")).toMatchObject({ code: 2 });
    expect(run("--label", "a b")).toMatchObject({ code: 2, err: expect.stringContaining("--label may use letters") });
    expect(run("--flag")).toMatchObject({ code: 2, err: expect.stringContaining("Usage: benchmarks/skillret/run") });
  });
});
