import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Query, SEED, draw, ensureFiles, mix, privateCorpus, proportional, publicCorpus, readLock, readQueries, readSkills, stratified } from "./dataset.ts";
import { type Split, writeAssets } from "./fakes.ts";

const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "skillret-dataset-"));
  dirs.push(d);
  return d;
};

// A test split of six skills and four queries (two need one skill, one two, one three), and a train split of ten skills
// with a query for every one, every pair and every triple of them.
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
    ["q3", "react hooks, helm charts on kubernetes deployment, pytest fixtures", ["t4", "t5", "t6"]],
    ["q4", "docker networking", ["t2"]],
  ],
};
const S = Array.from({ length: 10 }, (_, i) => `s${i}`);
const combos = (n: number, from = 0): string[][] => (n === 0 ? [[]] : S.slice(from).flatMap((id, i) => combos(n - 1, from + i + 1).map((rest) => [id, ...rest])));
const TRAIN: Split = {
  skills: S.map((id) => [id, `train skill ${id}`]),
  queries: [1, 2, 3].flatMap((n) => combos(n).map((needs): [string, string, string[]] => [`p-${needs.join("-")}`, `a request for ${needs.join(" and ")}`, needs])),
};

const assetsWithData = (): string => {
  const dir = tmp();
  writeAssets(dir, TEST, TRAIN);
  return dir;
};

describe("the lock", () => {
  test("pins every file", () => {
    const dir = assetsWithData();
    expect(readLock(dir).files["test-skills.jsonl"].records).toBe(6);
    const lock = JSON.parse(readFileSync(join(dir, "ASSETS.lock"), "utf8"));
    delete lock.files["train-qrels.jsonl"];
    writeFileSync(join(dir, "ASSETS.lock"), JSON.stringify(lock));
    expect(() => readLock(dir)).toThrow("does not pin train-qrels.jsonl");
  });

  test("the committed lock pins the revision, and all six files with their sizes, checksums and line counts", () => {
    const lock = readLock(join(import.meta.dir, "..", "assets"));
    expect(lock.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(lock.files).sort()).toEqual(["test-qrels.jsonl", "test-queries.jsonl", "test-skills.jsonl", "train-qrels.jsonl", "train-queries.jsonl", "train-skills.jsonl"]);
    for (const f of Object.values(lock.files)) {
      expect(f.url).toContain(lock.revision);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(lock.files["test-skills.jsonl"].records).toBe(6006);
    expect(lock.files["test-queries.jsonl"].records).toBe(4392);
    expect(lock.files["test-qrels.jsonl"].records).toBe(7187);
  });
});

describe("ensureFiles", () => {
  const serve = (src: string) => {
    const hits: string[] = [];
    let failFirst = 0;
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const name = new URL(req.url).pathname.slice(1);
        hits.push(name);
        if (failFirst-- > 0) return new Response("busy", { status: 503 });
        return existsSync(join(src, name)) ? new Response(Bun.file(join(src, name))) : new Response("no", { status: 404 });
      },
    });
    return { hits, failNext: (n: number) => (failFirst = n), url: `http://127.0.0.1:${server.port}` };
  };
  const lockFor = (src: string, url: string): string => {
    writeAssets(src, TEST, TRAIN, url);
    const assets = tmp();
    copyFileSync(join(src, "ASSETS.lock"), join(assets, "ASSETS.lock"));
    return assets;
  };
  const quiet = () => {};

  test("fetches the files it is asked for, checks them, and fetches nothing again", async () => {
    const src = tmp();
    const probe = serve(src);
    const assets = lockFor(src, probe.url);
    await ensureFiles(assets, ["test-queries.jsonl", "test-qrels.jsonl"], quiet);
    expect(readdirSync(assets).sort()).toEqual(["ASSETS.lock", "test-qrels.jsonl", "test-queries.jsonl"]);
    expect(readFileSync(join(assets, "test-queries.jsonl"), "utf8")).toBe(readFileSync(join(src, "test-queries.jsonl"), "utf8"));
    expect(probe.hits.sort()).toEqual(["test-qrels.jsonl", "test-queries.jsonl"]);
    await ensureFiles(assets, ["test-queries.jsonl", "test-qrels.jsonl"], quiet);
    expect(probe.hits).toHaveLength(2);
  });

  test("tries a failed fetch again", async () => {
    const src = tmp();
    const probe = serve(src);
    const assets = lockFor(src, probe.url);
    probe.failNext(2);
    const log: string[] = [];
    await ensureFiles(assets, ["test-qrels.jsonl"], (l) => log.push(l), 0);
    expect(probe.hits).toHaveLength(3);
    expect(log.filter((l) => l.includes("Trying again"))).toHaveLength(2);
    expect(existsSync(join(assets, "test-qrels.jsonl"))).toBe(true);
  });

  test("gives up after three tries", async () => {
    const src = tmp();
    const probe = serve(src);
    const assets = lockFor(src, probe.url);
    probe.failNext(10);
    await expect(ensureFiles(assets, ["test-qrels.jsonl"], quiet, 0)).rejects.toThrow("could not fetch test-qrels.jsonl: HTTP 503");
    expect(probe.hits).toHaveLength(3);
    expect(readdirSync(assets)).toEqual(["ASSETS.lock"]);
  });

  test("refuses a download whose checksum is not the pinned one, and leaves no file", async () => {
    const src = tmp();
    const probe = serve(src);
    const assets = lockFor(src, probe.url);
    writeFileSync(join(src, "test-qrels.jsonl"), "changed upstream\n");
    await expect(ensureFiles(assets, ["test-qrels.jsonl"], quiet, 0)).rejects.toThrow("ASSETS.lock pins");
    expect(readdirSync(assets)).toEqual(["ASSETS.lock"]);
  });

  test("refuses a copy in assets/ that is not the pinned one", async () => {
    const src = tmp();
    const probe = serve(src);
    const assets = lockFor(src, probe.url);
    writeFileSync(join(assets, "test-qrels.jsonl"), "edited\n");
    await expect(ensureFiles(assets, ["test-qrels.jsonl"], quiet)).rejects.toThrow("Move it aside");
    expect(probe.hits).toHaveLength(0);
  });
});

describe("reading the files", () => {
  test("reads the skills as id and SKILL.md", () => {
    expect(readSkills(assetsWithData(), "test-skills.jsonl")[1]).toEqual({ id: "t2", text: "docker container compose networking" });
  });

  test("joins the queries with their qrels", () => {
    expect(readQueries(assetsWithData(), "test-queries.jsonl", "test-qrels.jsonl")[1]).toEqual({ id: "q2", query: TEST.queries[1][1], relevant: ["t2", "t3"] });
  });

  test("stops when a file is not the size the lock says", () => {
    const dir = assetsWithData();
    writeFileSync(join(dir, "test-skills.jsonl"), readFileSync(join(dir, "test-skills.jsonl"), "utf8").split("\n").slice(0, 3).join("\n"));
    expect(() => readSkills(dir, "test-skills.jsonl")).toThrow("has 3 lines, and ASSETS.lock pins 6");
  });

  test("stops when the qrels of a query are not its skill_ids", () => {
    const dir = assetsWithData();
    const qrels = readFileSync(join(dir, "test-qrels.jsonl"), "utf8").split("\n");
    writeFileSync(join(dir, "test-qrels.jsonl"), [...qrels.slice(0, 1), JSON.stringify({ query_id: "q1", skill_id: "t9", relevance: 1 }), ...qrels.slice(2)].join("\n"));
    expect(() => readQueries(dir, "test-queries.jsonl", "test-qrels.jsonl")).toThrow("the qrels of q1 are not the skill_ids of the query");
  });

  test("stops at a line that is not JSON, and at a skill with no text", () => {
    const dir = assetsWithData();
    writeFileSync(join(dir, "test-qrels.jsonl"), `${readFileSync(join(dir, "test-qrels.jsonl"), "utf8").trim().split("\n").slice(0, 6).join("\n")}\n{oops\n`);
    expect(() => readQueries(dir, "test-queries.jsonl", "test-qrels.jsonl")).toThrow("test-qrels.jsonl:7 is not valid JSON");
    const lines = readFileSync(join(dir, "test-skills.jsonl"), "utf8").trim().split("\n");
    writeFileSync(join(dir, "test-skills.jsonl"), [...lines.slice(0, 5), JSON.stringify({ id: "t6", skill_md: "  " })].join("\n"));
    expect(() => readSkills(dir, "test-skills.jsonl")).toThrow('has no string "skill_md"');
  });
});

describe("drawing", () => {
  const queries = (sizes: number[]): Query[] => sizes.map((n, i) => ({ id: `q${i}`, query: "q", relevant: Array.from({ length: n }, (_, j) => `s${j}`) }));

  test("draw takes n of the items, under the seed, in their order", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const picked = draw(items, 10, SEED);
    expect(picked).toEqual(draw(items, 10, SEED));
    expect(picked).toEqual([...picked].sort((a, b) => a - b));
    expect(new Set(picked).size).toBe(10);
    expect(picked).not.toEqual(items.slice(0, 10));
    expect(draw(items, 10, SEED + 1)).not.toEqual(picked);
    expect(draw(items, 100, SEED)).toEqual(items);
    expect(() => draw(items, 101, SEED)).toThrow("cannot draw 101 of 100");
  });

  test("proportional gives whole shares first and the rest to the biggest fractions", () => {
    const qs = queries([...Array(5).fill(1), ...Array(3).fill(2), ...Array(2).fill(3)]);
    expect(proportional(qs, 4)).toEqual({ 1: 2, 2: 1, 3: 1 });
    expect(proportional(qs, 3)).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(proportional(qs, 10)).toEqual({ 1: 5, 2: 3, 3: 2 });
    expect(Object.values(proportional(qs, 7)).reduce((a, b) => a + b)).toBe(7);
  });

  test("stratified takes the quota of each size at random and never the first N", () => {
    const qs = queries([...Array(50).fill(1), ...Array(30).fill(2), ...Array(20).fill(3)]);
    const picked = stratified(qs, proportional(qs, 20), SEED);
    expect(mix(picked)).toEqual({ 1: 10, 2: 6, 3: 4 });
    expect(picked).toEqual(stratified(qs, proportional(qs, 20), SEED));
    expect(picked).not.toEqual(qs.slice(0, 20));
    expect(picked.map((q) => qs.indexOf(q))).toEqual(picked.map((q) => qs.indexOf(q)).sort((a, b) => a - b));
  });
});

describe("the public corpus", () => {
  test("is the test split: all its skills and all its queries", () => {
    const c = publicCorpus(assetsWithData());
    expect(c.corpus).toBe("public");
    expect(c.skills.map((s) => s.id)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(c.queries.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(c.sample).toMatchObject({ split: "test", limit: null, n_queries: 4, queries_per_size: { 1: 2, 2: 1, 3: 1 } });
  });

  test("with a limit, keeps all the skills and draws queries in the mix of the whole set", () => {
    const c = publicCorpus(assetsWithData(), 2);
    expect(c.skills).toHaveLength(6);
    expect(c.queries).toHaveLength(2);
    expect(mix(c.queries)).toEqual({ 1: 1, 2: 1 });
    expect(c.sample).toMatchObject({ seed: SEED, limit: 2 });
    expect(publicCorpus(assetsWithData(), 99).queries).toHaveLength(4);
  });

  test("stops when a query needs a skill the split does not have", () => {
    const dir = tmp();
    writeAssets(dir, { ...TEST, queries: [["q1", "a request", ["t1", "elsewhere"]]] }, TRAIN);
    expect(() => publicCorpus(dir)).toThrow("needs a skill that is not in the test split");
  });
});

describe("the private corpus", () => {
  test("has as many skills as the test pool, all from the train split", () => {
    const c = privateCorpus(assetsWithData());
    expect(c.corpus).toBe("private");
    expect(c.skills).toHaveLength(6);
    for (const s of c.skills) expect(S).toContain(s.id);
    expect(new Set(c.skills.map((s) => s.id)).size).toBe(6);
  });

  test("draws train queries whose skills are all in the library, in the mix of the test queries", () => {
    const c = privateCorpus(assetsWithData());
    const ids = new Set(c.skills.map((s) => s.id));
    expect(c.queries).toHaveLength(4);
    expect(mix(c.queries)).toEqual({ 1: 2, 2: 1, 3: 1 });
    for (const q of c.queries) expect(q.relevant.every((id) => ids.has(id))).toBe(true);
    // a pool of six holds 6 single skills, 15 pairs and 20 triples
    expect(c.sample).toMatchObject({ split: "train", seed: SEED, n_skills: 6, n_eligible_queries: 41, n_queries: 4, queries_per_size: { 1: 2, 2: 1, 3: 1 } });
  });

  test("is the same on every run, and a limit takes a stratified part of it", () => {
    const dir = assetsWithData();
    const all = privateCorpus(dir);
    expect(privateCorpus(dir)).toEqual(all);
    const part = privateCorpus(dir, 2);
    expect(part.skills).toEqual(all.skills);
    expect(part.queries).toHaveLength(2);
    for (const q of part.queries) expect(all.queries).toContainEqual(q);
    expect(mix(part.queries)).toEqual({ 1: 1, 2: 1 });
  });

  test("stops when the train split cannot give the test split's mix", () => {
    const dir = tmp();
    const many: Split = { ...TEST, queries: Array.from({ length: 30 }, (_, i): [string, string, string[]] => [`q${i}`, "a request", ["t1", "t2", "t3"]]) };
    writeAssets(dir, many, TRAIN);
    expect(() => privateCorpus(dir)).toThrow("cannot draw 30 of 20");
  });
});
