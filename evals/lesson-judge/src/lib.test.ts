import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, parseCases, pct, rubricVersion, selectCases } from "./lib.ts";
import type { Case } from "./score.ts";

const ASSETS = join(import.meta.dir, "..", "assets");
const HELD_OUT = join(ASSETS, "held-out");

const line = (c: Record<string, unknown>) => JSON.stringify({ id: "a", mode: "new", label: "good", labelReason: "r", origin: "real", from: "lesson-01", memory: "memories/m", input: { lesson: "l", source: "s" }, ...c });

describe("parseCases", () => {
  test("reads a case, and says which line is wrong", () => {
    expect(parseCases(line({}))).toHaveLength(1);
    expect(() => parseCases("{nope")).toThrow("cases:1 is not valid JSON");
    expect(() => parseCases(line({ label: "meh" }))).toThrow('label "meh"');
    expect(() => parseCases(line({ mode: "edit" }))).toThrow('mode "edit"');
    expect(() => parseCases(line({ origin: "guess" }))).toThrow('origin "guess"');
    expect(() => parseCases(line({ labelReason: " " }))).toThrow("no labelReason");
    expect(() => parseCases(line({ input: { lesson: "l" } }))).toThrow("no input.lesson and input.source");
    expect(() => parseCases(`${line({})}\n${line({})}`)).toThrow("repeats one");
    expect(() => parseCases("")).toThrow("no cases");
  });

  test("a bad case has a kind from the set and a good case none", () => {
    expect(() => parseCases(line({ label: "bad" }))).toThrow('kind "undefined"');
    expect(() => parseCases(line({ label: "bad", kind: "wrong" }))).toThrow('kind "wrong"');
    expect(() => parseCases(line({ kind: "dated-status" }))).toThrow("only bad cases have one");
    expect(parseCases(line({ label: "bad", kind: "dated-status" }))[0]?.kind).toBe("dated-status");
  });

  test("an update has `extending` and no `related`, and a new lesson has no `extending`", () => {
    expect(() => parseCases(line({ mode: "update" }))).toThrow("input.extending must be there");
    expect(() => parseCases(line({ input: { lesson: "l", source: "s", extending: "e" } }))).toThrow("input.extending must be absent");
    expect(() => parseCases(line({ mode: "update", input: { lesson: "l", source: "s", extending: "e", related: [] } }))).toThrow("sends no related list");
    expect(parseCases(line({ mode: "update", input: { lesson: "l", source: "s", extending: "e" } }))).toHaveLength(1);
  });

  test("`related: []` is a list distill may send, and is kept as it is", () => {
    expect(parseCases(line({ input: { lesson: "l", source: "s", related: [] } }))[0]?.input.related).toEqual([]);
  });
});

describe("selectCases", () => {
  const cases = parseCases([...Array.from({ length: 4 }, (_, i) => line({ id: `g${i}` })), ...Array.from({ length: 12 }, (_, i) => line({ id: `b${i}`, label: "bad", kind: "dated-status" }))].join("\n"));

  test("keeps all cases without a limit, and a good/bad mix with one", () => {
    expect(selectCases(cases)).toHaveLength(16);
    const four = selectCases(cases, 4);
    expect(four.filter((c) => c.label === "good")).toHaveLength(1);
    expect(four.filter((c) => c.label === "bad")).toHaveLength(3);
    expect(selectCases(cases, 2).map((c) => c.label).sort()).toEqual(["bad", "good"]);
  });
});

test("pct", () => {
  expect(pct(null)).toBe("n/a");
  expect(pct(0.1234)).toBe("12.3%");
});

describe("the public assets", () => {
  const cases: Case[] = parseCases(readFileSync(join(ASSETS, CASES), "utf8"));
  const held: Case[] = parseCases(readFileSync(join(HELD_OUT, CASES), "utf8"));
  const readme = readFileSync(join(ASSETS, "README.md"), "utf8");

  test("have a rubric version", () => {
    expect(rubricVersion(ASSETS)).toBeGreaterThanOrEqual(1);
  });

  test("the held-out cases are the ids the README lists, and none of them is in the cases a default run scores", () => {
    const listed = /^held-out ids:\s*(.+)$/m.exec(readme)?.[1]?.split(",").map((s) => s.trim()) ?? [];
    expect(listed.length).toBeGreaterThan(0);
    expect(held.map((c) => c.id)).toEqual(listed);
    const scored = new Set(cases.map((c) => c.id));
    expect(held.filter((c) => scored.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  test("no case input is on both sides: a held-out lesson is not also scored by default", () => {
    const seen = new Set(cases.map((c) => JSON.stringify(c.input)));
    expect(held.filter((c) => seen.has(JSON.stringify(c.input))).map((c) => c.id)).toEqual([]);
  });

  test("every case has a one-line reason, a real or hand-written origin, and a distill case it was made from", () => {
    for (const c of [...cases, ...held]) {
      expect(c.labelReason.includes("\n")).toBe(false);
      expect(c.from).toMatch(/^[a-z]+-\d+$/);
      expect(c.memory).toMatch(/^memories\//);
    }
  });

  test("an update's lesson is the lesson it extends with lines added, and a new lesson with an empty `related` says so on purpose", () => {
    for (const c of [...cases, ...held]) {
      if (c.mode === "update") expect(c.input.lesson.includes(c.input.extending as string)).toBe(true);
      else expect(Array.isArray(c.input.related) || c.input.related === undefined).toBe(true);
    }
  });

  test("the make-up table of the README counts the cases of both files", () => {
    const all = [...cases, ...held];
    const rows = [...readme.matchAll(/^\| (new|update) \| ([a-z-]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)].map((m) => ({ key: `${m[1]}/${m[2]}`, counts: m.slice(3).map(Number) }));
    const expected = new Map<string, number[]>();
    for (const c of all) {
      const key = `${c.mode}/${c.kind ?? "good"}`;
      const [n = 0, real = 0, hand = 0, feedback = 0] = expected.get(key) ?? [];
      expected.set(key, [n + 1, real + (c.origin === "real" ? 1 : 0), hand + (c.origin === "hand-written" ? 1 : 0), feedback + ((c.input.feedback ?? []).length > 0 ? 1 : 0)]);
    }
    expect(rows.map((r) => r.key).sort()).toEqual([...expected.keys()].sort());
    for (const r of rows) expect({ key: r.key, counts: r.counts }).toEqual({ key: r.key, counts: expected.get(r.key) ?? [] });
  });

  test("the targets: 20 good cases of each mode, and every kind present", () => {
    const all = [...cases, ...held];
    for (const mode of ["new", "update"]) expect(all.filter((c) => c.mode === mode && c.label === "good").length).toBeGreaterThanOrEqual(20);
    expect([...new Set(all.filter((c) => c.label === "bad").map((c) => `${c.mode}/${c.kind}`))].sort()).toEqual(["new/dated-status", "new/duplicate-asset", "new/one-run", "new/ungrounded", "update/off-rule-update", "update/restated-update", "update/ungrounded"]);
  });
});
