import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, HELD_OUT } from "./inputs.ts";
import { parseCases, selectCases } from "./lib.ts";
import type { Case } from "./score.ts";

const input = { proposal: { ref: "bundle//knowledge/x", source: "consolidate", content: "---\ndescription: d\n---\nbody" }, reason: "needs-judgment", siblings: [] };
const line = (o: Record<string, unknown>) => JSON.stringify({ id: "a", kind: "promotion", set: "s", origin: "real", label: "good", category: "good", labelReason: "r", memory: "memories/x", bundle: "base", family: "x", input, ...o });

describe("parseCases", () => {
  test("reads a case and refuses what the scorer cannot use", () => {
    expect(parseCases(line({}))[0]?.id).toBe("a");
    expect(() => parseCases("")).toThrow("no cases");
    expect(() => parseCases("{")).toThrow("not valid JSON");
    expect(() => parseCases(`${line({})}\n${line({})}`)).toThrow("repeats the id a");
    expect(() => parseCases(line({ input: { proposal: { ref: "r" } } }))).toThrow("no input");
    expect(() => parseCases(line({ label: "maybe" }))).toThrow('label "maybe"');
    expect(() => parseCases(line({ label: "bad", category: "good" }))).toThrow("category");
    expect(() => parseCases(line({ category: "stale" }))).toThrow("category");
    expect(() => parseCases(line({ origin: "found" }))).toThrow('origin "found"');
  });
});

describe("selectCases", () => {
  const cases = ["good", "ephemeral", "duplicate", "stale"].flatMap((category) => [1, 2, 3].map((i) => ({ id: `${category}-${i}`, category }) as Case));
  test("takes the kinds in turn, so a short run holds every one", () => {
    expect(selectCases(cases, 4).map((c) => c.id)).toEqual(["good-1", "ephemeral-1", "duplicate-1", "stale-1"]);
    expect(selectCases(cases, 5).map((c) => c.id)).toContain("good-2");
    expect(selectCases(cases)).toBe(cases);
    expect(selectCases(cases, 99)).toBe(cases);
  });
});

describe("the public cases", () => {
  const dir = join(import.meta.dir, "..", "assets");
  const scored = parseCases(readFileSync(join(dir, CASES), "utf8"));
  const held = parseCases(readFileSync(join(dir, HELD_OUT), "utf8"));

  test("the held-out cases are not among the scored ones, by id or by family", () => {
    const ids = new Set(scored.map((c) => c.id));
    const families = new Set(scored.map((c) => c.family));
    expect(held.filter((c) => ids.has(c.id) || families.has(c.family))).toEqual([]);
  });

  test("every case is a promotion the drain sends to judgment for the reason it gives", () => {
    for (const c of [...scored, ...held]) {
      expect(c.kind).toBe("promotion");
      expect(c.input.proposal.source).toBe("consolidate");
      expect(c.input.reason).toBe("needs-judgment");
      expect(c.input.liveAsset).toBeUndefined();
      expect(c.input.siblings).toEqual([]);
    }
  });
});
