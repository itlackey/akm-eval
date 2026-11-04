import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Case, expectedRelation, parseCases, selectCases } from "./lib.ts";
import { casesSha256 } from "./inputs.ts";

const ASSETS = join(import.meta.dir, "..", "assets");
const read = (file: string): Case[] => parseCases(readFileSync(join(ASSETS, file), "utf8"), file);

const note = (ref: string, content: string, created = "2026-11-01T00:00:00.000Z") => ({ ref, type: "memory", created, updated: created, content });
const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "x-1",
  kind: "overlap",
  set: "pairs",
  source: "pair-pass",
  a: note("memories/a", "The retry limit is 5. Shared."),
  b: note("memories/b", "Dead jobs go to jobs-dead. Shared."),
  safe: [],
  only_a: ["The retry limit is 5."],
  only_b: ["Dead jobs go to jobs-dead."],
  labelReason: "r",
  ...over,
});
const file = (...cases: Record<string, unknown>[]): string => cases.map((c) => JSON.stringify(c)).join("\n");

describe("parseCases", () => {
  test("reads a case", () => {
    expect(parseCases(file(base()))[0]).toMatchObject({ id: "x-1", kind: "overlap", safe: [] });
  });
  test("refuses what akm could not be given or the scorer could not read", () => {
    const refused: [Record<string, unknown>, string][] = [
      [base({ id: "" }), 'no string "id"'],
      [base({ source: "made-up" }), 'source "made-up"'],
      [base({ a: { ...note("memories/a", "x"), content: 1 } }), 'note a has no string "content"'],
      [base({ b: note("memories/b", "x", "yesterday") }), "not a date"],
      [base({ a: note("memories/a", "x", "2026-11-03T00:00:00.000Z") }), "a is the older note"],
      [base({ safe: ["c"] }), "not a list of a and b"],
      [base({ only_a: [""] }), 'no list of strings "only_a"'],
      [base({ safe: ["a"], only_a: ["The retry limit is 5."] }), "a is safe to retire but has claims of its own"],
      [base({ only_b: ["Dead jobs go elsewhere."] }), "not word for word in note b"],
    ];
    for (const [c, why] of refused) expect(() => parseCases(file(c))).toThrow(why);
    expect(() => parseCases(file(base(), base()))).toThrow("repeats the id x-1");
    expect(() => parseCases("")).toThrow("has no cases");
    expect(() => parseCases("{nope")).toThrow("not valid JSON");
  });
  test("equal dates are allowed (neither note is newer)", () => {
    expect(parseCases(file(base()))).toHaveLength(1);
  });
});

describe("selectCases", () => {
  const cases = ["duplicate", "duplicate", "duplicate", "overlap", "overlap", "subsumed"].map((kind, i) => ({ id: `${kind}-${i}`, kind }) as Case);
  test("without a limit, or with a larger one, all of them", () => {
    expect(selectCases(cases)).toBe(cases);
    expect(selectCases(cases, 9)).toBe(cases);
  });
  test("takes the kinds in turn, in file order", () => {
    expect(selectCases(cases, 3).map((c) => c.id)).toEqual(["duplicate-0", "overlap-3", "subsumed-5"]);
    expect(selectCases(cases, 4).map((c) => c.id)).toEqual(["duplicate-0", "duplicate-1", "overlap-3", "subsumed-5"]);
  });
});

describe("the public cases", () => {
  const cases = read("cases.jsonl");
  const held = read("heldout/cases.jsonl");
  const all = [...cases, ...held];
  const retired = readFileSync(join(ASSETS, "retired.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; reason: string });

  test("112 cases: 92 scored and 20 held out, each id once; 108 are pairs the pass sent and 4 are hand-written", () => {
    expect(cases).toHaveLength(92);
    expect(held).toHaveLength(20);
    expect(new Set(all.map((c) => c.id)).size).toBe(112);
    expect(all.filter((c) => c.source === "pair-pass")).toHaveLength(108);
    const hand = all.filter((c) => c.source === "hand-written");
    expect(hand).toHaveLength(4);
    expect(hand.every((c) => c.set === "hand" && c.id.startsWith("hand-late-"))).toBe(true);
    expect(held.every((c) => c.source === "pair-pass")).toBe(true);
  });
  test("the held-out cases are every fifth case of each kind, by id", () => {
    const byKind = new Map<string, string[]>();
    for (const c of [...all].filter((x) => x.source === "pair-pass").sort((x, y) => (x.id < y.id ? -1 : 1))) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.id]);
    const fifth = [...byKind.values()].flatMap((ids) => ids.filter((_, i) => i % 5 === 4)).sort();
    expect(held.map((c) => c.id).sort()).toEqual(fifth);
  });
  test("every kind is present, and each has the labels its construction gives", () => {
    const safe = (kind: string) => new Set(all.filter((c) => c.kind === kind).map((c) => c.safe.length));
    expect([...safe("duplicate")]).toEqual([2]);
    expect([...safe("supersedes")]).toEqual([1]);
    expect([...safe("subsumed")]).toEqual([1]);
    for (const kind of ["contradicts", "overlap", "lookalike"]) expect([...safe(kind)]).toEqual([0]);
    expect(new Set(all.map((c) => c.kind))).toEqual(new Set(["duplicate", "subsumed", "supersedes", "contradicts", "overlap", "lookalike"]));
  });
  test("a side is safe exactly when it has no claim of its own, and the expected relation follows", () => {
    for (const c of all) {
      for (const side of c.safe) expect(side === "a" ? c.only_a : c.only_b).toEqual([]);
      if (c.safe.length === 0) expect(c.only_a.length + c.only_b.length).toBeGreaterThan(0);
      expect(["duplicate", "subsumed", "overlap"]).toContain(expectedRelation(c));
    }
  });
  test("contradictions are the same age; a replaced value is told by a later b that says so", () => {
    for (const c of all.filter((x) => x.kind === "contradicts")) expect(c.a.created).toBe(c.b.created);
    for (const c of all.filter((x) => x.kind === "supersedes")) expect(Date.parse(c.a.created)).toBeLessThan(Date.parse(c.b.created));
  });
  test("every pair is a pass pair: two memories, planted once, the same note in one text", () => {
    const texts = new Map<string, string>();
    for (const c of all) {
      for (const n of [c.a, c.b]) {
        expect(n.type).toBe("memory");
        expect(n.ref.startsWith("memories/")).toBe(true);
        expect(texts.get(n.ref) ?? n.content).toBe(n.content);
        texts.set(n.ref, n.content);
      }
    }
  });
  test("a retired case is not also a case", () => {
    const ids = new Set(all.map((c) => c.id));
    for (const r of retired) {
      expect(ids.has(r.id)).toBe(false);
      expect(r.reason.length).toBeGreaterThan(20);
    }
    expect(retired).toHaveLength(7);
  });
  test("every case carries a label reason and the canary", () => {
    for (const c of all) {
      expect(c.labelReason.length).toBeGreaterThan(20);
      expect(c.canary).toContain("canary GUID");
    }
  });
  test("the digest of the cases file changes with a case", () => {
    expect(casesSha256(ASSETS)).toMatch(/^[0-9a-f]{64}$/);
    expect(casesSha256(ASSETS)).not.toBe(casesSha256(join(ASSETS, "heldout")));
  });
});
