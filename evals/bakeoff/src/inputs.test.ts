import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LoadedCase } from "./collect.ts";
import { assetsSha256, caseProblems, loadCases, parseCases, termProblems, treeSha256 } from "./inputs.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bakeoff-inputs-"));
  dirs.push(d);
  return d;
};

/** A corpus folder with these cases and files. */
function corpus(cases: unknown, files: Record<string, string> = {}): string {
  const dir = temp();
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  writeFileSync(join(dir, "cases.json"), typeof cases === "string" ? cases : JSON.stringify(cases));
  return dir;
}
const base = { id: "a", process: "memory-inference", files: ["memories/m.md"], expected: { required: ["x"] } };
const lines = (...xs: string[]): string => xs.join("\n  ");
const loadError = (dir: string): string => {
  try {
    loadCases(dir);
    return "";
  } catch (e) {
    return (e as Error).message.replace(dir, "<dir>");
  }
};

describe("the cases of a corpus folder", () => {
  test("the public corpus is sound: 55 cases, in 5 processes, with the files they name", () => {
    const cases = loadCases(PUBLIC);
    expect(cases).toHaveLength(55);
    expect(cases.every((c) => c.files.every((f) => (c.texts[f] ?? "").trim() !== ""))).toBe(true);
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(55);
  });

  test("a folder with no cases.json, or one that is not a list of cases, is refused with the file named", () => {
    expect(loadError(temp())).toBe("<dir>/cases.json is missing");
    expect(loadError(corpus("not json"))).toMatch(/^<dir>\/cases\.json is not valid JSON/);
    expect(loadError(corpus("{}"))).toBe("<dir>/cases.json must hold a list of cases");
    expect(loadError(corpus("[]"))).toBe("<dir>/cases.json must hold a list of cases");
    expect(loadError(corpus([{ id: "a" }]))).toBe("<dir>/cases.json: case 1 needs an id, a process, a list of files and an expected object");
  });

  test("each way a case can be wrong is named with the case", () => {
    const files = { "memories/m.md": "text" };
    expect(loadError(corpus([base, base], files))).toContain("a: the id is used twice");
    expect(loadError(corpus([{ ...base, process: "reflect" }], files))).toContain('a: unknown process "reflect". The processes are memory-inference, remember-enrich, schema-repair, session-summary, consolidate-promote');
    expect(loadError(corpus([{ ...base, files: ["memories/m.md", "memories/n.md"] }], { ...files, "memories/n.md": "x" }))).toContain("a: memory-inference reads one file, not 2");
    expect(loadError(corpus([base], {}))).toContain("a: memories/m.md is missing or empty");
    expect(loadError(corpus([base], { "memories/m.md": "  \n" }))).toContain("a: memories/m.md is missing or empty");
    expect(loadError(corpus([{ ...base, files: ["../m.md"] }], files))).toContain("a: ../m.md is not a path inside the corpus folder");
    expect(loadError(corpus([{ ...base, files: ["/etc/passwd"] }], files))).toContain("a: /etc/passwd is not a path inside the corpus folder");
    expect(loadError(corpus([{ ...base, files: ["memories/m.txt"] }], { "memories/m.txt": "x" }))).toContain("a: memory-inference reads .md files, not memories/m.txt");
    expect(loadError(corpus([{ ...base, expected: {} }], files))).toContain("a: required needs a list of terms");
    expect(loadError(corpus([{ id: "b", process: "remember-enrich", files: ["memories/m.md"], expected: { keywords: ["x"] } }], files))).toContain("b: observed_at needs a date, or null for a memory that writes none");
    expect(loadError(corpus([{ id: "c", process: "session-summary", files: ["s/p/s.md"], expected: { required: ["x"], topics: ["x"] } }], { "s/p/s.md": "x" }))).toContain("c: session-summary reads .jsonl files, not s/p/s.md");
    expect(loadError(corpus([{ id: "d", process: "consolidate-promote", files: ["memories/a.md"], expected: { promote: ["memories/a"] } }], files))).toContain("d: consolidate-promote reads a pool of two files or more, not 1");
    expect(loadError(corpus([{ id: "d", process: "consolidate-promote", files: ["memories/a.md", "memories/b.md"], expected: { promote: ["memories/c"], protected: ["memories/a"] } }], { "memories/a.md": "x", "memories/b.md": "y" }))).toBe(
      `<dir>/cases.json has 1 problem:\n  d: the promote ref "memories/c" is not the ref of one of its files`,
    );
  });

  test("a note that needs no derived memory expects no-change and needs no required term, and noChange must be a boolean", () => {
    const files = { "memories/m.md": "text" };
    expect(loadError(corpus([{ ...base, expected: { noChange: true } }], files))).toBe("");
    expect(loadError(corpus([{ ...base, expected: { noChange: true, required: ["x"] } }], files))).toBe("");
    expect(loadError(corpus([{ ...base, expected: { noChange: false } }], files))).toContain("a: required needs a list of terms");
    expect(loadError(corpus([{ ...base, expected: { noChange: "yes" } }], files))).toContain("a: noChange needs true or false");
    expect(loadError(corpus([{ ...base, expected: { noChange: true, required: "x" } }], files))).toContain("a: required needs a list of terms");
  });

  test("scope labels describe the complete normalized tuple, including an explicitly unscoped child", () => {
    const files = { "memories/m.md": "text" };
    for (const scope of [{}, { user: "u", agent: "a", run: "77", channel: "staging" }]) expect(loadError(corpus([{ ...base, expected: { required: ["x"], scope } }], files))).toBe("");
    for (const scope of [[], "staging", { run: 77 }, { user: " " }, { project: "p" }]) expect(loadError(corpus([{ ...base, expected: { required: ["x"], scope } }], files))).toContain("scope needs an object");
  });

  test("the problems of a corpus are counted and listed, one to a line", () => {
    const msg = loadError(corpus([{ ...base, expected: {} }, { ...base, id: "b", files: ["memories/zz.md"] }], { "memories/m.md": "x" }));
    expect(msg).toBe(`<dir>/cases.json has 2 problems:\n  ${lines("a: required needs a list of terms", "b: memories/zz.md is missing or empty")}`);
  });

  test("parseCases reads the cases without their files", () => {
    expect(parseCases(JSON.stringify([base])) as unknown).toEqual([base]);
  });
});

describe("terms: what generate keeps", () => {
  const mk = (text: string, expected: LoadedCase["expected"]): LoadedCase[] => [{ id: "a", process: "memory-inference", files: ["memories/m.md"], texts: { "memories/m.md": text }, expected }];

  test("a term in the files stays in them, and a term out of them stays out", () => {
    expect(termProblems(mk("The Checkpoint is set", { required: ["checkpoint"], forbidden: ["2026-02-12"] }), mk("The Checkpoint is set", { required: ["checkpoint"], forbidden: ["2026-02-12"] }))).toEqual([]);
    // the term was renamed in the case and in the files alike: fine
    expect(termProblems(mk("The Sentinel is set", { required: ["sentinel"] }), mk("The Checkpoint is set", { required: ["checkpoint"] }))).toEqual([]);
  });

  test("a term that is no longer in the files, or has come into them, is named with the term it was", () => {
    expect(termProblems(mk("The Sentinel is set", { required: ["checkpoint"] }), mk("The Checkpoint is set", { required: ["checkpoint"] }))).toEqual(['a: the required term "checkpoint" is now "checkpoint", and it does not match the files the way it did']);
    expect(termProblems(mk("It dates from 2026-02-12", { forbidden: ["2026-02-12"] }), mk("It dates from 2026-02-11", { forbidden: ["2026-02-12"] }))).toEqual(['a: the forbidden term "2026-02-12" is now "2026-02-12", and it does not match the files the way it did']);
    expect(termProblems(mk("x", { required: ["a", "b"] }), mk("x", { required: ["a"] }))).toEqual(["a: required has a different number of terms"]);
    expect(termProblems(mk("x", {}), [...mk("x", {}), ...mk("y", {})])).toEqual(["1 cases against 2"]);
  });

  test("the date of an enriched memory is a term too, and null is none", () => {
    expect(termProblems(mk("on 2026-02-14", { observed_at: "2026-02-14" }), mk("on 2026-02-14", { observed_at: "2026-02-14" }))).toEqual([]);
    expect(termProblems(mk("on 2026-02-14", { observed_at: null }), mk("on 2026-02-14", { observed_at: null }))).toEqual([]);
  });

  test("caseProblems also reads cases that are in memory", () => {
    expect(caseProblems(mk("text", { required: ["x"] }))).toEqual([]);
    expect(caseProblems(mk("", { required: ["x"] }))).toEqual(["a: memories/m.md is missing or empty"]);
  });
});

describe("digests", () => {
  test("the digest of a folder holds on another machine: it covers each file by its path from the folder and its content", () => {
    const a = corpus([base], { "memories/m.md": "text" });
    const b = temp();
    cpSync(a, b, { recursive: true });
    expect(treeSha256(a)).toBe(treeSha256(b));
    expect(assetsSha256(a)).toBe(treeSha256(a));
    writeFileSync(join(b, "memories", "m.md"), "text!");
    expect(treeSha256(a)).not.toBe(treeSha256(b));
    const c = temp();
    cpSync(a, c, { recursive: true });
    writeFileSync(join(c, "memories", "other.md"), "x");
    expect(treeSha256(a)).not.toBe(treeSha256(c));
  });
});
