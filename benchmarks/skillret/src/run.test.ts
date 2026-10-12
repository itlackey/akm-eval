import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { akmVersion, commandLine, writeConfig } from "../../../lib/akm/akm.ts";
import { UNVERSIONED, lockedParts, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { harnessSha256, sha256Json } from "../../../lib/provenance.ts";
import { clearRunning } from "../../../lib/results.ts";
import { readStored, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import * as akm from "./akm.ts";
import { BUILDER, withSemantic } from "./collect.ts";
import { type Corpus, assetsDigest, privateCorpus, publicCorpus } from "./dataset.ts";
import { type Split, fakeAkmScript, sandboxRunning, writeAssets } from "./fakes.ts";
import { MEASUREMENT } from "./measurement.ts";
import { CURATE_CHECK, curateSample } from "./sample.ts";
import { failureOf, runCorpus } from "./run.ts";

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
function setup(test: Split = TEST, train: Split = TRAIN) {
  const root = tmp();
  const assets = join(root, "assets");
  writeAssets(assets, test, train);
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

  test("an answer with no searchMode is a failure on the semantic index, where a build that drops the field would pass keyword rankings as semantic", async () => {
    const s = setup();
    const semantic = s.newSandbox(true);
    const keyword = s.newSandbox();
    await akm.load(semantic, s.corpus.skills, true);
    await akm.load(keyword, s.corpus.skills);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    for (const system of ["search", "curate"] as const) {
      const unsaid = await akm.ask(semantic, system, "NOMODE docker networking", known, "semantic");
      expect(unsaid).toMatchObject({ ranked: [], mode: null });
      expect(unsaid.error).toContain(`akm ${system} did not say how it searched (no searchMode), and a semantic answer has to say semantic`);
      expect(unsaid.timedOut).toBeUndefined();
    }
    // the keyword index has semantic search off, so an answer that does not name its mode is still its keyword ranking
    expect(await akm.ask(keyword, "search", "NOMODE docker networking", known)).toMatchObject({ ranked: ["t2"], mode: null });
    // and a name that is not a string does not count as one
    const odd = join(s.root, "odd-mode-akm.ts");
    writeFileSync(odd, `const [cmd] = process.argv.slice(2); if (cmd === "search" && process.argv[3] === "--help") console.log("--detail=<detail>"); else console.log(JSON.stringify({ hits: [{ ref: "skills/t2" }], searchMode: 3 }));`);
    const oddSemantic = { ...s.newSandbox(true), cmd: ["bun", odd] };
    expect((await akm.ask(oddSemantic, "search", "docker", known, "semantic")).error).toContain("did not say how it searched");
  });

  test("a call that akm does not answer in time fails as a timeout, which the answer says apart from other failures", async () => {
    const s = setup();
    const sb = s.newSandbox();
    await akm.load(sb, s.corpus.skills);
    const known = new Set(s.corpus.skills.map((x) => x.id));
    const slow = await akm.ask(sb, "search", "HANG docker networking", known, "keyword", 1000);
    expect(slow).toMatchObject({ ranked: [], mode: null, error: "akm search timed out after 1s", timedOut: true });
    expect(slow.seconds).toBeGreaterThanOrEqual(2); // it was asked twice
    const broken = await akm.ask(sb, "search", "BROKEN docker networking", known, "keyword", 1000);
    expect(broken.error).toContain("exited 70");
    expect(broken.timedOut).toBeUndefined();
    expect((await akm.ask(sb, "search", "docker networking", known, "keyword", 1000)).timedOut).toBeUndefined();
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
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null }); // every call answered
    expect(failureOf([summary])).toBeUndefined();
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this benchmark's code and lib/
    expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir));
    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
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
    expect(stored.curate_check).toEqual({ seed: 42, queries: ["q1", "q2", "q3", "q4"], keyword: { compared: 4, same: 4, different: [], errored: 0, timeouts: 0 }, semantic: { compared: 4, same: 4, different: [], errored: 0, timeouts: 0 } });

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

  test("records what the run was made of: the akm that built the semantic index, the configs, the data files and the seed", async () => {
    const s = setup();
    const secret = () => {
      const sb = s.newSandbox();
      writeConfig(sb, { configVersion: "0.9.0", semanticSearchMode: "off", registries: [], apiKey: "sk-not-for-the-summary" });
      return sb;
    };
    const first = await logged(() => runCorpus(s.corpus, s.ctx({ label: "one", newSandbox: secret }), { assets: s.assets, results: s.results }));
    const second = await logged(() => runCorpus(s.corpus, s.ctx({ label: "two" }), { assets: s.assets, results: s.results }));
    const stored = (summary: { results_dir: string }) => JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    const [a, b] = [stored(first.result), stored(second.result)];
    // who built the index: the new one, and the same record when the next run keeps it
    expect(a.semantic_index).toBe("cold");
    expect(a.semantic_index_built_by).toEqual({ version: "0.9.99-test", akm_bin: a.akm_bin, akm_build: a.akm_build, builtAt: "build 1" });
    expect(b.semantic_index).toBe("warm");
    expect(b.semantic_index_built_by).toEqual(a.semantic_index_built_by);
    // the configs the indexes ran with, secrets redacted
    expect(a.config.keyword).toEqual({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [], apiKey: "<redacted>" });
    expect(JSON.stringify(a)).not.toContain("sk-not-for-the-summary");
    expect(a.config.semantic).toEqual({ configVersion: "0.9.0", semanticSearchMode: "auto", registries: [], embedding: { localModel: "Xenova/bge-small-en-v1.5", queryTimeoutMs: 600000 } });
    expect(b.config).toEqual({ keyword: { configVersion: "0.9.0", semanticSearchMode: "off", registries: [] }, semantic: a.config.semantic });
    // the data files: the same digest for the same files, and another for other files
    expect(a.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.assets_sha256).toBe(a.assets_sha256);
    expect(a.seed).toBeNull();
    writeFileSync(join(s.assets, "test-qrels.jsonl"), `${readFileSync(join(s.assets, "test-qrels.jsonl"), "utf8")} `);
    const third = await logged(() => runCorpus(s.corpus, s.ctx({ label: "three" }), { assets: s.assets, results: s.results }));
    expect(stored(third.result).assets_sha256).not.toBe(a.assets_sha256);
  });

  test("a private corpus records the seed that drew it and digests the files it read, and a run without the semantic index records no semantic fields", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, corpus: "private" };
    const { result: summary } = await logged(() => runCorpus(corpus, s.ctx({ label: "p", semantic: false }), { assets: s.assets, results: s.results }));
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.seed).toBe("42"); // as text, as the seed of any custom corpus is
    expect(stored.assets_sha256).toBe(assetsDigest(s.assets, "private"));
    expect(stored.assets_sha256).not.toBe(assetsDigest(s.assets, "public"));
    expect(Object.keys(stored.config)).toEqual(["keyword"]);
    expect(stored.semantic_index_built_by).toBeUndefined();
    expect(stored.engine).toBeUndefined();
  });

  test("the digest of the data files is of their names in assets/ and their content, wherever assets/ is, and leaves the working folder as it was", () => {
    const s = setup();
    const here = process.cwd();
    const digest = assetsDigest(s.assets, "public");
    expect(process.cwd()).toBe(here);
    const copy = join(tmp(), "elsewhere");
    cpSync(s.assets, copy, { recursive: true });
    expect(assetsDigest(copy, "public")).toBe(digest);
    expect(assetsDigest(copy, "private")).not.toBe(digest);
    rmSync(join(copy, "test-skills.jsonl"));
    expect(() => assetsDigest(copy, "public")).toThrow();
    expect(process.cwd()).toBe(here);
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
    expect(stored.curate_check).toEqual({ seed: 42, queries: ["q1", "q2", "q3", "q4"], keyword: { compared: 4, same: 4, different: [], errored: 0, timeouts: 0 } });
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
    expect(summary.curate_check.keyword).toEqual({ compared: 5, same: 4, different: ["cd"], errored: 0, timeouts: 0 });
    expect(summary.curate_check.semantic).toEqual({ compared: 5, same: 4, different: ["cd"], errored: 0, timeouts: 0 });
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
    expect(summary.curate_check.keyword).toEqual({ compared: 3, same: 3, different: [], errored: 2, timeouts: 0 });
    expect(summary.curate_check.semantic).toEqual({ compared: 3, same: 3, different: [], errored: 2, timeouts: 0 });
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.id === "broken").curate.error).toContain("exited 70");
    expect(rows.find((r) => r.id === "flaky").search.error).toBeUndefined();
    expect(lines.join("\n")).toContain("errored calls: akm search 2");
    expect(lines.join("\n")).toContain("errored calls: akm search, semantic 2");
    expect(lines.join("\n")).toContain("curate check: 2 curate calls on the semantic index failed");
    // a run with calls that failed is aborted: the summary says so, with the same reason the run fails with, the 8 calls of search and of the curate check
    const reason = "8 akm calls failed. Their queries are left out of the numbers, or of the curate check: see the errors in samples.jsonl.";
    expect(summary).toMatchObject({ status: "aborted", aborted_reason: reason });
    expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ status: "aborted", aborted_reason: reason });
    expect(failureOf([summary])).toBe(reason);
    expect(failureOf([summary, summary])).toStartWith("16 akm calls failed.");
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

  test("stops before the queries when the first semantic search does not say how it searched", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, queries: [{ id: "q", query: "NOMODE docker networking", relevant: ["t2"] }, ...s.corpus.queries] };
    const failure = await logged(() => runCorpus(corpus, s.ctx(), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((failure as Error).message).toContain("akm cannot search with its embedder: akm search did not say how it searched (no searchMode)");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("a semantic call that does not say how it searched is a failed call, left out of the semantic line and not scored as a semantic ranking", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, queries: [...s.corpus.queries, { id: "nomode", query: "NOMODE docker networking", relevant: ["t2"] }] };
    const { result: summary } = await logged(() => runCorpus(corpus, s.ctx(), { assets: s.assets, results: s.results }));
    // the keyword index has semantic search off, so its call is the keyword ranking it was asked for
    expect(summary.errored).toEqual({ search: 0, semantic_search: 1 });
    expect(summary.curate_check.keyword).toMatchObject({ compared: 5, errored: 0 });
    expect(summary.curate_check.semantic).toMatchObject({ compared: 4, errored: 1 });
    expect(summary.search_mode).toEqual({ keyword: "keyword", semantic: "semantic" });
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.id === "nomode").semantic_search).toMatchObject({ ranked: [], error: expect.stringContaining("did not say how it searched") });
    expect(summary.timeouts).toEqual({ search: 0, semantic_search: 0 });
  });

  test("counts the calls that akm did not answer in time apart from the other failed calls, and marks their rows", async () => {
    const s = setup();
    const corpus: Corpus = {
      ...s.corpus,
      queries: [
        { id: "ok", query: "docker networking", relevant: ["t2"] },
        { id: "hang", query: "HANG docker networking", relevant: ["t2"] },
        { id: "broken", query: "BROKEN docker networking", relevant: ["t2"] },
      ],
    };
    const { result: summary, lines } = await logged(() => runCorpus(corpus, s.ctx({ label: "slow", semantic: false, workers: 3, callTimeoutMs: 1000 }), { assets: s.assets, results: s.results }));
    expect(summary.errored).toEqual({ search: 2 });
    expect(summary.timeouts).toEqual({ search: 1 });
    expect(summary.curate_check.keyword).toEqual({ compared: 1, same: 1, different: [], errored: 2, timeouts: 1 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.timeouts).toEqual({ search: 1 });
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.id, r.search.timed_out, r.curate.timed_out])).toEqual([["ok", undefined, undefined], ["hang", true, true], ["broken", undefined, undefined]]);
    expect(rows[1].search.error).toBe("akm search timed out after 1s");
    expect(rows[2].search.error).toContain("exited 70");
    const table = lines.join("\n");
    expect(table).toContain("errored calls: akm search 2 (left out of its numbers; 1 of them timed out)");
    expect(table).toContain("curate check: 2 curate calls on the keyword index failed (1 of them timed out)");
    const reason = "4 akm calls failed, 2 of them by timing out. Their queries are left out of the numbers, or of the curate check: see the errors in samples.jsonl.";
    expect(stored).toMatchObject({ status: "aborted", aborted_reason: reason });
    expect(failureOf([summary])).toBe(reason);
  });

  test("stops with a message when akm cannot be run", async () => {
    const s = setup();
    const failure = await logged(() => runCorpus(s.corpus, s.ctx({ newSandbox: () => ({ ...s.sandboxRunningScript(s.script), cmd: ["/nonexistent/akm"] }) }), { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((failure as Error).message).toContain("could not run");
  });
});

/** What a run wrote: the summary and the rows of its results folder. */
const stored = (dir: string) => ({
  summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
  rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
});

describe("the manifest of a run", () => {
  const folders = (s: ReturnType<typeof setup>) => ({ assets: s.assets, results: s.results });

  test("is sound, carries the parts MEASUREMENT.lock records, and a digest of the input and the labels of every query", async () => {
    const s = setup();
    const { summary } = stored((await logged(() => runCorpus(s.corpus, s.ctx({ label: "m" }), folders(s)))).result.results_dir);
    const { manifest } = summary;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(summary).kind).toBe("manifest");
    const parts = lockedParts(MEASUREMENT);
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "skillret", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, scorer: parts.scorer, treatment_hints: {}, engines: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: summary.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: null, config_patch_sha256: null, timeout_ms: null, seed: null });
    expect(Object.keys(manifest.cases)).toEqual(["q1", "q2", "q3", "q4"]);
    const library = sha256Json(akm.skillFiles(s.corpus.skills));
    expect(manifest.cases.q2).toEqual({
      input_sha256: sha256Json({ query: "compose containers with docker and migrate the postgres database schema", library }),
      label_sha256: sha256Json({ relevant: ["t2", "t3"] }),
    });
    expect(manifest.completion).toEqual({ selected: ["q1", "q2", "q3", "q4"], scored: ["q1", "q2", "q3", "q4"], errored: [] });
    expect(manifest.config.redacted).toEqual({ keyword: summary.config.keyword, semantic: summary.config.semantic });
    expect(summary).toMatchObject({ corpus: "public", corpus_kind: "public", corpus_private: false, corpus_folder: null, seed: null });
  });

  test("a query whose call failed is errored in the completion, and a skill that changed is another input for every query", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, queries: [...s.corpus.queries, { id: "broken", query: "BROKEN docker networking", relevant: ["t2"] }] };
    const first = stored((await logged(() => runCorpus(corpus, s.ctx({ label: "a", semantic: false }), folders(s)))).result.results_dir).summary.manifest;
    expect(first.completion).toEqual({ selected: ["q1", "q2", "q3", "q4", "broken"], scored: ["q1", "q2", "q3", "q4"], errored: ["broken"] });
    const edited: Corpus = { ...corpus, skills: corpus.skills.map((x) => (x.id === "t2" ? { ...x, text: `${x.text} and swarm` } : x)) };
    const second = stored((await logged(() => runCorpus(edited, s.ctx({ label: "b", semantic: false }), folders(s)))).result.results_dir).summary.manifest;
    for (const id of Object.keys(first.cases)) {
      expect(second.cases[id].input_sha256).not.toBe(first.cases[id].input_sha256);
      expect(second.cases[id].label_sha256).toBe(first.cases[id].label_sha256);
    }
  });

  test("a limit does not change the input of a query: the library stays whole", async () => {
    const s = setup();
    const full = stored((await logged(() => runCorpus(s.corpus, s.ctx({ label: "f", semantic: false }), folders(s)))).result.results_dir).summary.manifest;
    const limited = stored((await logged(() => runCorpus(publicCorpus(s.assets, 2), s.ctx({ label: "l", limit: 2, semantic: false }), folders(s)))).result.results_dir).summary.manifest;
    expect(Object.keys(limited.cases).length).toBe(2);
    for (const [id, digest] of Object.entries<any>(limited.cases)) expect(digest).toEqual(full.cases[id]);
  });

  test("the custom corpus is a split of the dataset: its summary says so, with its seed as text, and it holds nothing private", async () => {
    const s = setup();
    const corpus: Corpus = { ...s.corpus, corpus: "private" };
    const { summary } = stored((await logged(() => runCorpus(corpus, s.ctx({ label: "c", semantic: false }), folders(s)))).result.results_dir);
    expect(summary).toMatchObject({ corpus: "custom", corpus_kind: "split", corpus_private: false, corpus_folder: null, seed: "42" });
    expect(summary.manifest).toMatchObject({ corpus: "custom", settings: { seed: "42" } });
    expect(manifestProblems(summary.manifest)).toEqual([]);
  });
});

describe("the index builder (#73)", () => {
  test("is the file that lays out the bundle, and the default key of the semantic index names it", async () => {
    expect(BUILDER).toEqual([join(import.meta.dir, "akm.ts")]);
    expect(readFileSync(BUILDER[0] as string, "utf8")).toContain("export async function load(");
    const s = setup();
    const key = (): string => JSON.parse(readFileSync(join(s.cacheRoot, "skillret-public", "state.json"), "utf8")).key;
    await logged(() => runCorpus(s.corpus, s.ctx(), { assets: s.assets, results: s.results }));
    const named = key();
    // the same index with no builder file is another key, so the default one does name akm.ts
    rmSync(s.cacheRoot, { recursive: true });
    await logged(() => runCorpus(s.corpus, s.ctx({ cache: { root: s.cacheRoot, cmd: ["bun", s.script], builder: [] } }), { assets: s.assets, results: s.results }));
    expect(key()).not.toBe(named);
  });

  test("a change to a file the builder names builds a new index, and says why", async () => {
    const s = setup();
    const lay = join(s.root, "lay.ts");
    writeFileSync(lay, "export const layout = 'skills/<id>/SKILL.md';\n");
    const cache = { root: s.cacheRoot, cmd: ["bun", s.script], builder: [lay] };
    const run = (label: string) => logged(() => runCorpus(s.corpus, s.ctx({ label, cache }), { assets: s.assets, results: s.results }));
    expect((await run("one")).result.semantic_index).toBe("cold");
    expect((await run("two")).result.semantic_index).toBe("warm");
    writeFileSync(lay, "export const layout = 'skills/<name>/SKILL.md';\n");
    const changed = await run("three");
    expect(changed.result.semantic_index).toBe("cold");
    expect(changed.lines.join("\n")).toContain("the code that lays out the bundle");
  });
});

describe("rescore", () => {
  /** A repository of the files the benchmark's measurement reads, around a tiny dataset: the code, lib/ and the lock are copies of this checkout's. */
  function repo(s: ReturnType<typeof setup>): string {
    const here = join(import.meta.dir, "..", "..", "..");
    const root = tmp();
    cpSync(join(here, "lib"), join(root, "lib"), { recursive: true });
    mkdirSync(join(root, "benchmarks", "skillret", "src"), { recursive: true });
    for (const file of readdirSync(import.meta.dir)) if (file.endsWith(".ts")) cpSync(join(import.meta.dir, file), join(root, "benchmarks", "skillret", "src", file));
    cpSync(join(here, "MEASUREMENT.lock"), join(root, "MEASUREMENT.lock"));
    cpSync(s.assets, join(root, "benchmarks", "skillret", "assets"), { recursive: true });
    return root;
  }
  const folders = (s: ReturnType<typeof setup>) => ({ assets: s.assets, results: s.results });

  test("scores a run again from the ranked results its samples.jsonl holds, to the rows and metrics it wrote", async () => {
    const s = setup({ ...TEST, queries: [...TEST.queries, ["broken", "BROKEN docker networking", ["t2"]], ["empty", "EMPTY docker networking", ["t2"]]] });
    const { result } = await logged(() => runCorpus(s.corpus, s.ctx({ label: "r", workers: 2 }), folders(s)));
    clearRunning(result.results_dir);
    const again = rescoreRun(readStored(result.results_dir), { root: repo(s) });
    const was = stored(result.results_dir);
    expect(again.changed).toEqual([]);
    expect(again.dropped).toEqual([]);
    expect(again.rows).toEqual(was.rows);
    for (const field of ["metrics", "by_size", "errored", "timeouts", "no_results", "curate_check", "status", "aborted_reason", "n_queries", "call_seconds"]) expect([field, again.summary[field]]).toEqual([field, was.summary[field]]);
    expect(again.summary.status).toBe("aborted"); // a call failed, and it still says so
    expect(manifestProblems(again.summary.manifest)).toEqual([]);
    expect(again.summary.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(again.summary.manifest.collector).toEqual(was.summary.manifest.collector);
    expect(again.summary.manifest.cases).toEqual(was.summary.manifest.cases);
  });

  test("a run from before the manifest, whose rows hold no scores, scores again too, to the rows it would write now", async () => {
    const s = setup();
    const { result } = await logged(() => runCorpus(s.corpus, s.ctx({ label: "old", semantic: false }), folders(s)));
    clearRunning(result.results_dir);
    const was = stored(result.results_dir);
    const dir = `${result.results_dir}-before`;
    mkdirSync(dir);
    const { manifest: _m, corpus_kind: _k, corpus_private: _p, corpus_folder: _f, ...legacy } = was.summary;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(legacy));
    writeFileSync(join(dir, "samples.jsonl"), was.rows.map(({ search: { scores: _s, ...search }, ...row }) => `${JSON.stringify({ ...row, search })}\n`).join(""));
    const again = rescoreRun(readStored(dir), { root: repo(s) });
    expect(again.legacy).toBe(true);
    expect(again.rows).toEqual(was.rows);
    expect(again.summary.metrics).toEqual(was.summary.metrics);
    expect(again.summary.manifest.collector.version).toBe(UNVERSIONED);
  });

  test("a run that read other data files than the ones here is refused, and so is a run whose rows lack the ranked results", async () => {
    const s = setup();
    const { result } = await logged(() => runCorpus(s.corpus, s.ctx({ label: "x", semantic: false }), folders(s)));
    clearRunning(result.results_dir);
    const was = stored(result.results_dir);
    const copy = (name: string, summary: object, rows: object[]): string => {
      const dir = `${result.results_dir}-${name}`;
      mkdirSync(dir);
      writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
      writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
      return dir;
    };
    const { manifest: _m, ...legacy } = was.summary;
    const other = copy("other", { ...legacy, assets_sha256: "0".repeat(64) }, was.rows);
    expect(() => rescoreRun(readStored(other), { root: repo(s) })).toThrow(/was made before the manifest, and cannot be scored again: it read other data files than the ones in benchmarks\/skillret\/assets now/);
    const thin = copy("thin", was.summary, was.rows.map(({ search: { ranked: _r, ...search }, ...row }) => ({ ...row, search })));
    expect(() => rescoreRun(readStored(thin), { root: repo(s) })).toThrow(/its rows lack the raw output the skillret scorer reads: search.ranked \(4 rows: q1, q2, q3, q4\)/);
  });

  test("a run on the custom corpus, a split of the data files, records no folder and is scored against the split drawn again from the summary", async () => {
    // a train split that can give the test split's mix: ten skills, with a query for every one, every pair and every triple of them
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const combos = (n: number, from = 0): string[][] => (n === 0 ? [[]] : ids.slice(from).flatMap((id, i) => combos(n - 1, from + i + 1).map((rest) => [id, ...rest])));
    const train: Split = { skills: ids.map((id) => [id, `train skill ${id}`]), queries: [1, 2, 3].flatMap((n) => combos(n).map((needs): [string, string, string[]] => [`p-${needs.join("-")}`, `a request for ${needs.join(" and ")} skill`, needs])) };
    const s = setup(TEST, train);
    const custom = privateCorpus(s.assets);
    const { result } = await logged(() => runCorpus(custom, s.ctx({ label: "split", semantic: false }), { assets: s.assets, results: s.results }));
    clearRunning(result.results_dir);
    const was = stored(result.results_dir);
    expect(was.summary).toMatchObject({ corpus: "custom", corpus_kind: "split", corpus_private: false, corpus_folder: null, seed: "42", n_queries: 4 });
    const root = repo(s);
    // the split is drawn again from the data files and the sample the summary records, with no folder
    expect(MEASUREMENT.loadCases(root, was.summary)).toEqual(custom.queries);
    expect(MEASUREMENT.loadCases(root, { ...was.summary, sample: { ...was.summary.sample, limit: 2 } })).toEqual(privateCorpus(s.assets, 2).queries);
    // scripts/rescore asks a custom run for the folder of its cases (corpus_folder, or --cases DIR): a split has none, so it is given the folder of the data files
    const again = rescoreRun(readStored(result.results_dir), { root, cases: "benchmarks/skillret/assets" });
    expect(again.changed).toEqual([]);
    expect(again.dropped).toEqual([]);
    expect(again.rows).toEqual(was.rows);
    expect(again.summary.metrics).toEqual(was.summary.metrics);
    expect(again.summary.manifest.rescored_from).toMatchObject({ dropped: [] });
  });

  test("the queries a stored run is scored against are drawn as the run drew them, with the limit it recorded, and nothing is fetched", async () => {
    const s = setup();
    const root = repo(s);
    expect(MEASUREMENT.loadCases(root, { corpus: "public", sample: { limit: 2 } })).toEqual(publicCorpus(s.assets, 2).queries);
    expect(MEASUREMENT.loadCases(root, { corpus: "public", sample: { limit: null } })).toEqual(s.corpus.queries);
    rmSync(join(root, "benchmarks", "skillret", "assets", "test-qrels.jsonl"));
    expect(() => MEASUREMENT.loadCases(root, { corpus: "public" })).toThrow("test-qrels.jsonl is not in");
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
    expect(run("--corpus", "everything")).toMatchObject({ code: 2, err: expect.stringContaining('--corpus must be public, custom or all, not "everything"') });
    expect(run("--limit", "0")).toMatchObject({ code: 2, err: expect.stringContaining("--limit must be a positive integer") });
    expect(run("--limit", "ten")).toMatchObject({ code: 2 });
    expect(run("--label", "a b")).toMatchObject({ code: 2, err: expect.stringContaining("--label may use letters") });
    expect(run("--flag")).toMatchObject({ code: 2, err: expect.stringContaining("Usage: benchmarks/skillret/run") });
  });
});

describe("--repeat", () => {
  /**
   * The benchmark in a repository root of its own, as a checkout holds it: its code, lib/ and the lock of this checkout around the tiny dataset in assets/.
   * run.ts reads its assets and writes its results beside itself, so a run of it touches nothing of this checkout. Its akm is the fake one.
   */
  function benchmark() {
    const here = join(import.meta.dir, "..", "..", "..");
    const root = tmp();
    cpSync(join(here, "lib"), join(root, "lib"), { recursive: true, filter: (src) => basename(src) !== "node_modules" });
    const code = join(root, "benchmarks", "skillret", "src");
    mkdirSync(code, { recursive: true });
    for (const file of readdirSync(import.meta.dir)) if (file.endsWith(".ts") && !file.endsWith(".test.ts")) cpSync(join(import.meta.dir, file), join(code, file));
    cpSync(join(here, "MEASUREMENT.lock"), join(root, "MEASUREMENT.lock"));
    writeAssets(join(root, "benchmarks", "skillret", "assets"), TEST, TRAIN);
    const script = fakeAkmScript(root);
    const results = join(root, "benchmarks", "skillret", "results");
    const run = (...args: string[]) => {
      const r = Bun.spawnSync(["bun", join(code, "run.ts"), ...args], { env: { ...process.env, AKM_BIN: commandLine(["bun", script]) }, stdout: "pipe", stderr: "pipe" });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    };
    /** What the run left in results/, without the date the folders start with. */
    const names = () => (existsSync(results) ? readdirSync(results).sort().map((n) => n.replace(/^\d{4}-\d{2}-\d{2}-/, "")) : []);
    const read = (name: string) => JSON.parse(readFileSync(join(results, readdirSync(results).find((n) => n.endsWith(`-${name}`)) as string, "summary.json"), "utf8"));
    return { results, run, names, read, spread: (label: string) => JSON.parse(readFileSync(join(results, readdirSync(results).find((n) => n.endsWith(`-${label}-repeat-summary.json`)) as string), "utf8")) };
  }

  test("--repeat 2 writes two runs, each a whole run, and the spread of their metrics beside them", () => {
    const b = benchmark();
    const r = b.run("--repeat", "2", "--limit", "3", "--label", "rep");
    expect(r.code, r.err).toBe(0);
    expect(b.names()).toEqual(["rep-r1", "rep-r2", "rep-repeat-summary.json"]);
    const [one, two] = [b.read("rep-r1"), b.read("rep-r2")];
    expect([one.label, one.status, two.label, two.status]).toEqual(["rep-r1", "complete", "rep-r2", "complete"]);
    expect([readManifest(one).kind, readManifest(two).kind]).toEqual(["manifest", "manifest"]);
    for (const dir of readdirSync(b.results).filter((n) => !n.endsWith(".json"))) expect(existsSync(join(b.results, dir, ".running")), dir).toBe(false);
    expect(readdirSync(b.results).filter((n) => !n.endsWith(".json")).map((n) => readFileSync(join(b.results, n, "samples.jsonl"), "utf8").trim().split("\n").length)).toEqual([3, 3]);
    // the spread is of the metrics of the runs: akm answers the same twice, so it has no width
    const ndcg = one.metrics.search["NDCG@10"];
    expect(ndcg).toBeGreaterThan(0);
    expect(two.metrics.search["NDCG@10"]).toBe(ndcg);
    const spread = b.spread("rep");
    expect(spread).toMatchObject({ eval: "skillret", corpus: "public", label: "rep", repeat: 2, akm_version: "0.9.99-test", n_errored: { min: 0, max: 0, mean: 0 }, timeouts: { search: { min: 0, max: 0, mean: 0 } }, metrics: { search: { "NDCG@10": { min: ndcg, max: ndcg } } } });
    expect(spread.metrics.search["NDCG@10"].mean).toBeCloseTo(ndcg, 4);
    expect(spread.runs).toEqual(readdirSync(b.results).filter((n) => /-rep-r\d$/.test(n)));
    expect("model" in spread).toBe(false); // no model is called
  }, 120_000);

  test("without --label the runs take the label of a single run, akm-<version>, and a run without --repeat is unchanged", () => {
    const b = benchmark();
    const r = b.run("--repeat", "2", "--limit", "3");
    expect(r.code, r.err).toBe(0);
    expect(b.names()).toEqual(["akm-0.9.99-test-r1", "akm-0.9.99-test-r2", "akm-0.9.99-test-repeat-summary.json"]);
    const single = benchmark();
    expect(single.run("--limit", "3", "--label", "once").code).toBe(0);
    expect(single.names()).toEqual(["once"]);
  }, 120_000);

  test("--repeat must be a positive integer, and a refused value runs nothing", () => {
    const b = benchmark();
    for (const value of ["0", "1.5", "two"]) expect(b.run("--repeat", value, "--limit", "3")).toMatchObject({ code: 2, err: expect.stringContaining("--repeat must be a positive integer") });
    expect(b.names()).toEqual([]);
    expect(b.run("--help").out).toContain("--repeat  run each corpus N times");
  });
});
