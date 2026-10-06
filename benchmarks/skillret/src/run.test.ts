import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { akmVersion } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { type Corpus, publicCorpus } from "./dataset.ts";
import { type Split, fakeAkmScript, sandboxRunning, writeAssets } from "./fakes.ts";
import { runCorpus } from "./run.ts";

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
  const sandboxes: string[] = [];
  const newSandbox = () => sandboxRunning(script, sandboxes);
  return { root, assets, results: join(root, "results"), script, sandboxes, newSandbox, corpus: publicCorpus(assets) };
}

const logged = async <T>(f: () => Promise<T>): Promise<{ result: T; lines: string[] }> => {
  const log = console.log;
  const lines: string[] = [];
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    return { result: await f(), lines };
  } finally {
    console.log = log;
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
  test("writes every skill, asks both commands for every query, scores them and writes the results", async () => {
    const s = setup();
    const { result: summary, lines } = await logged(() => runCorpus(s.corpus, { label: "t", newSandbox: s.newSandbox, workers: 3 }, { assets: s.assets, results: s.results }));
    const dir = join(s.results, readdirSync(s.results)[0]);
    expect(dir).toMatch(/\d{4}-\d\d-\d\d-t$/);
    expect(readdirSync(dir).sort()).toEqual(["samples.jsonl", "summary.json"]);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ eval: "skillret", corpus: "public", label: "t", akm_version: "0.9.99-test", search_mode: "keyword", depth: 15, workers: 3, n_skills: 6, n_queries: 4, errored: { search: 0, curate: 0 }, no_results: { search: 0, curate: 0 } });
    expect(stored.dataset).toMatchObject({ revision: "r".repeat(40), sha256: { "test-skills.jsonl": expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(stored.sample).toMatchObject({ split: "test", limit: null, n_queries: 4 });
    expect(summary.results_dir).toBe(dir);
    expect(stored.results_dir).toBeUndefined();

    // q1, q2 and q4 are found completely. q3 needs three skills and the query names words of two of them.
    for (const system of ["search", "curate"]) {
      expect(stored.metrics[system]).toMatchObject({ "Completeness@5": 0.75, "Completeness@10": 0.75, "Completeness@15": 0.75, "Recall@5": 0.9167, "MAP@5": 0.9167 });
      expect(stored.metrics[system]["NDCG@5"]).toBeCloseTo((3 + (1 + 1 / Math.log2(3)) / (1 + 1 / Math.log2(3) + 0.5)) / 4, 4);
    }
    expect(stored.by_size["1"]).toMatchObject({ n: 2, search: { "Completeness@5": 1, "NDCG@10": 1 } });
    expect(stored.by_size["2"]).toMatchObject({ n: 1, curate: { "Completeness@5": 1 } });
    expect(stored.by_size["3"]).toMatchObject({ n: 1, search: { "Completeness@15": 0, "Recall@15": 0.6667 } });

    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(rows[1]).toMatchObject({ relevant: ["t2", "t3"], search: { ranked: ["t3", "t2"] }, curate: { ranked: ["t3", "t2"] } });
    expect(rows[2].search.ranked).toEqual(["t5", "t4"]);

    const table = lines.join("\n");
    expect(table).toContain("akm search");
    expect(table).toContain("akm curate");
    expect(table).toContain("published by SkillRet");
    expect(table).toContain("BM25");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("gives the same rankings with one worker as with several", async () => {
    const s = setup();
    const run = async (workers: number) => {
      await logged(() => runCorpus(s.corpus, { label: `w${workers}`, newSandbox: s.newSandbox, workers }, { assets: s.assets, results: s.results }));
      const dir = readdirSync(s.results).find((d) => d.endsWith(`w${workers}`)) as string;
      return readFileSync(join(s.results, dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).search.ranked);
    };
    expect(await run(1)).toEqual(await run(4));
  });

  test("with a limit, prints no published numbers, which are for the whole public split", async () => {
    const s = setup();
    const corpus = publicCorpus(s.assets, 2);
    const { lines } = await logged(() => runCorpus(corpus, { label: "l", limit: 2, newSandbox: s.newSandbox }, { assets: s.assets, results: s.results }));
    expect(lines.join("\n")).not.toContain("published by SkillRet");
    expect(JSON.parse(readFileSync(join(s.results, readdirSync(s.results)[0], "summary.json"), "utf8"))).toMatchObject({ n_queries: 2, sample: { limit: 2 } });
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
    const { result: summary, lines } = await logged(() => runCorpus(corpus, { newSandbox: s.newSandbox, workers: 2 }, { assets: s.assets, results: s.results }));
    expect(summary.label).toBe("akm-0.9.99-test");
    expect(summary.errored).toEqual({ search: 2, curate: 2 });
    expect(summary.no_results).toEqual({ search: 1, curate: 1 });
    // ok and flaky score 1, empty scores 0, broken and stray are left out
    expect(summary.metrics.search["Recall@5"]).toBe(0.6667);
    const rows = readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.id === "broken").curate.error).toContain("exited 70");
    expect(rows.find((r) => r.id === "flaky").search.error).toBeUndefined();
    expect(lines.join("\n")).toContain("errored calls: search 2");
  });

  test("stops when akm indexes fewer assets than there are skills", async () => {
    const s = setup();
    const broken = join(s.root, "short-akm.ts");
    writeFileSync(broken, 'const [cmd] = process.argv.slice(2); if (cmd === "--version") console.log("0.9.99-test"); else console.log(JSON.stringify({ totalEntries: 5 }));');
    const newSandbox = () => sandboxRunning(broken, s.sandboxes);
    const failure = await logged(() => runCorpus(s.corpus, { newSandbox }, { assets: s.assets, results: s.results })).catch((e: Error) => e);
    expect((failure as Error).message).toContain("akm indexed 5 assets for 6 skills");
    for (const dirName of s.sandboxes) expect(existsSync(dirName)).toBe(false);
  });

  test("stops with a message when akm cannot be run", async () => {
    const s = setup();
    const newSandbox = () => ({ ...sandboxRunning(s.script, s.sandboxes), cmd: ["/nonexistent/akm"] });
    const failure = await logged(() => runCorpus(s.corpus, { newSandbox }, { assets: s.assets, results: s.results })).catch((e: Error) => e);
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
