import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assemble, explode, problems } from "./generate.ts";
import type { Qrel, Query } from "./lib.ts";

const REWRITE = resolve(import.meta.dir, "..", "..", "..", "lib", "rewrite", "rewrite.ts");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "retrieval-generate-"));
  dirs.push(d);
  return d;
};

const queries: Query[] = [
  { id: "q1", query: "how do I reach Alice about the service", kind: "direct", expected: ["knowledge/alice-guide", "knowledge/other"] },
  { id: "q2", query: "bake bread", kind: "no-answer", expected: [] },
  { id: "n1", query: "thanks!", kind: "chitchat" },
];
const qrels: Qrel[] = [
  { id: "q1", ref: "knowledge/alice-guide", grade: 3, reason: "Says that Alice owns it." },
  { id: "q1", ref: "knowledge/other", grade: 0, reason: "Unrelated.\nTwo lines.", banned: true },
  { id: "q2", ref: "knowledge/other", grade: 1, reason: "Same topic." },
];

describe("explode and assemble", () => {
  test("write one file per query and one per query's qrels, and read them back unchanged", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    expect(readFileSync(join(dir, "queries", "q1.txt"), "utf8")).toBe("how do I reach Alice about the service\n");
    expect(readFileSync(join(dir, "expected", "q1.txt"), "utf8")).toBe("knowledge/alice-guide\nknowledge/other\n");
    expect(existsSync(join(dir, "expected", "q2.txt"))).toBe(false);
    expect(readFileSync(join(dir, "qrels", "q1.txt"), "utf8")).toBe("knowledge/alice-guide\nSays that Alice owns it.\nknowledge/other\nUnrelated. Two lines.\n");
    expect(existsSync(join(dir, "qrels", "n1.txt"))).toBe(false);
    const back = assemble(queries, qrels, dir);
    expect(back.queries).toEqual(queries);
    expect(back.qrels).toEqual(qrels.map((r) => ({ ...r, reason: r.reason.replace(/\s+/g, " ") })));
    expect(back.qrels[1].banned).toBe(true); // a banned asset stays banned in the private copy
  });

  test("keep the grades, the ids and the kinds, whatever the text becomes", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    writeFileSync(join(dir, "queries", "q2.txt"), "bake rye\n");
    writeFileSync(join(dir, "expected", "q1.txt"), "knowledge/new-one\nknowledge/new-two\n");
    writeFileSync(join(dir, "qrels", "q2.txt"), "knowledge/changed\nA new reason.\n");
    const back = assemble(queries, qrels, dir);
    expect(back.queries[0].expected).toEqual(["knowledge/new-one", "knowledge/new-two"]);
    expect(back.queries[1]).toEqual({ id: "q2", query: "bake rye", kind: "no-answer", expected: [] });
    expect(back.queries[2]).toEqual({ id: "n1", query: "thanks!", kind: "chitchat" });
    expect(back.qrels[2]).toEqual({ id: "q2", ref: "knowledge/changed", grade: 1, reason: "A new reason." });
  });

  test("say what is missing when the rewrite did not write a file", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    rmSync(join(dir, "queries", "n1.txt"));
    expect(() => assemble(queries, qrels, dir)).toThrow("the rewrite did not write");
  });
});

describe("one rewrite run for the library, the queries and the qrels", () => {
  test("renames a name the same way in a file name, the file, a query, a ref and a reason", () => {
    const root = tmp();
    const input = join(root, "in");
    mkdirSync(join(input, "library", "knowledge"), { recursive: true });
    writeFileSync(join(input, "library", "knowledge", "alice-guide.md"), "# Guide\n\nAlice owns the service. Ask Alice before the first run.\n");
    writeFileSync(join(input, "library", "knowledge", "other.md"), "# Other\n\nSomething else entirely.\n");
    explode(queries, qrels, input);

    const map = join(root, "map.json");
    const run = Bun.spawnSync(["bun", REWRITE, "--seed", "7", "--map", map, input, join(root, "out")], { stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode).toBe(0);
    const replacement = JSON.parse(readFileSync(map, "utf8")).words.alice as string;
    expect(replacement).toMatch(/^[a-z]+$/);
    expect(replacement).not.toBe("alice");

    const back = assemble(queries, qrels, join(root, "out"));
    const renamed = replacement[0].toUpperCase() + replacement.slice(1);
    expect(back.queries[0].query).toBe(`how do I reach ${renamed} about the service`);
    expect(back.qrels[0]).toMatchObject({ ref: `knowledge/${replacement}-guide`, grade: 3, reason: `Says that ${renamed} owns it.` });
    expect(back.qrels[1].ref).toBe("knowledge/other");
    expect(back.queries[0].expected).toEqual([`knowledge/${replacement}-guide`, "knowledge/other"]);
    expect(existsSync(join(root, "out", "library", "knowledge", `${replacement}-guide.md`))).toBe(true);
    expect(readFileSync(join(root, "out", "library", "knowledge", `${replacement}-guide.md`), "utf8")).toContain(`${renamed} owns the service`);
    expect(JSON.stringify(back).toLowerCase()).not.toContain("alice");
  });
});

describe("problems", () => {
  const pub = { queries, qrels, nAssets: 2 };
  const refs = new Set(["knowledge/alice-guide", "knowledge/other"]);

  test("finds none in a sound private set", () => {
    expect(problems(pub, { queries, qrels, refs })).toEqual([]);
  });

  test("finds a qrel ref or an expected ref that names no asset in the private library", () => {
    const priv = { queries, qrels: [{ ...qrels[0], ref: "knowledge/gone" }, ...qrels.slice(1)], refs };
    expect(problems(pub, priv).join("\n")).toContain("1 qrel or expected refs name no asset in the private library, such as knowledge/gone");
    const lost = { queries: [{ ...queries[0], expected: ["knowledge/lost"] }, ...queries.slice(1)], qrels, refs };
    expect(problems(pub, lost).join("\n")).toContain("1 qrel or expected refs name no asset in the private library, such as knowledge/lost");
  });

  test("finds two assets that became one", () => {
    const priv = { queries, qrels: [qrels[0], { ...qrels[1], ref: qrels[0].ref }, qrels[2]], refs };
    expect(problems(pub, priv).join("\n")).toContain("1 qrel rows share a query and an asset after the rewrite");
  });

  test("finds a query that lost a relevant asset", () => {
    const priv = { queries, qrels: [{ ...qrels[0], grade: 1 }, ...qrels.slice(1)], refs };
    expect(problems(pub, priv)).toEqual(["q1 had 1 relevant assets and now has 0"]);
  });

  test("finds a library that lost an asset, and a query that went missing", () => {
    expect(problems(pub, { queries: queries.slice(1), qrels, refs: new Set(["knowledge/alice-guide", "knowledge/other", "knowledge/extra"]) }).join("\n")).toContain("the private library has 3 assets, the public one 2");
    expect(problems(pub, { queries: queries.slice(1), qrels, refs }).join("\n")).toContain("2 private queries for 3 public ones");
  });
});
