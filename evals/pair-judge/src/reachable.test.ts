import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Judged } from "./capture.ts";
import { parseCases } from "./lib.ts";
import { plantedNotes, problemWith, unreachable } from "./reachable.ts";
import type { Case } from "./score.ts";

const ASSETS = join(import.meta.dir, "..", "assets");
const load = (file: string): Case[] => parseCases(readFileSync(join(ASSETS, file), "utf8"), file);

const T1 = "2026-11-01T00:00:00.000Z";
const T2 = "2026-11-03T00:00:00.000Z";
const note = (name: string, created: string, updated = created) => ({ ref: `memories/${name}`, type: "memory", created, updated, content: `${name} text` });
const pair = (aCreated = T1, bCreated = T2): Case => ({ id: "c", kind: "overlap", set: "pairs", source: "pair-pass", a: note("a", aCreated), b: note("b", bCreated), safe: [], only_a: [], only_b: [], labelReason: "r" });
const judged = (a: ReturnType<typeof note>, b: ReturnType<typeof note>): Judged => ({ a: { ...a }, b: { ...b }, prompt: "" });

describe("problemWith", () => {
  test("a pair the pass judges, older first, is reachable", () => {
    expect(problemWith(pair(), [judged(note("a", T1), note("b", T2))])).toBeNull();
    // the dates shift by one amount, and the gap is what counts
    expect(problemWith(pair(), [judged(note("a", "2026-12-01T00:00:00.000Z"), note("b", "2026-12-03T00:00:00.000Z"))])).toBeNull();
  });
  test("a pair the pass does not judge is not", () => {
    expect(problemWith(pair(), [])).toBe("akm's pair pass does not judge this pair");
    expect(problemWith(pair(), [judged(note("a", T1), note("c", T2))])).toBe("akm's pair pass does not judge this pair");
  });
  test("the older note goes first", () => {
    expect(problemWith(pair(), [judged(note("b", T1), note("a", T2))])).toBe("akm judges the older note second");
  });
  test("with equal dates either note can go first, and the dates must be equal in akm's input too", () => {
    expect(problemWith(pair(T1, T1), [judged(note("b", T1), note("a", T1))])).toBeNull();
    expect(problemWith(pair(T1, T1), [judged(note("a", T1), note("b", T2))])).toContain("equal in the case and not in akm's input");
    expect(problemWith(pair(), [judged(note("a", T1), note("b", T1))])).toContain("not equal in the case and equal in akm's input");
  });
  test("the gap between the dates must be the same", () => {
    expect(problemWith(pair(), [judged(note("a", T1), note("b", "2026-11-02T00:00:00.000Z"))])).toContain("after a in the case and");
  });
  test("a note's updated date is its created date unless the note says otherwise, in both", () => {
    expect(problemWith(pair(), [judged(note("a", T1, "2026-11-02T00:00:00.000Z"), note("b", T2))])).toContain("the updated date of memories/a");
  });
});

describe("plantedNotes", () => {
  test("plants each note once, with the gaps between created dates kept and the newest a day old", () => {
    const now = Date.parse("2026-12-01T12:00:00.000Z");
    const notes = plantedNotes([pair(), { ...pair(), id: "d", b: note("c", "2026-11-02T00:00:00.000Z") }], now);
    expect(notes.map((n) => n.name).sort()).toEqual(["a", "b", "c"]);
    const at = (name: string) => notes.find((n) => n.name === name)?.mtimeMs as number;
    expect(at("b")).toBe(now - 86_400_000);
    expect(at("b") - at("a")).toBe(Date.parse(T2) - Date.parse(T1));
    expect(at("b") - at("c")).toBe(Date.parse(T2) - Date.parse("2026-11-02T00:00:00.000Z"));
  });
  test("refuses a note that is not a memory, and two texts for one note", () => {
    expect(() => plantedNotes([{ ...pair(), a: { ...note("a", T1), type: "knowledge", ref: "knowledge/a" } }])).toThrow("plants memories");
    expect(() => plantedNotes([pair(), { ...pair(), id: "d", a: { ...note("a", T1), content: "other" } }])).toThrow("not the same text");
  });
});

// The check against a real akm: AKM_CHECKOUT=DIR bun test evals/pair-judge/src/reachable.test.ts (the same as `bun evals/pair-judge/src/reachable.ts --akm DIR`).
describe.skipIf(!process.env.AKM_CHECKOUT)("the public cases against akm", () => {
  test("every case is a pair that akm's pass sends", async () => {
    const dir = process.env.AKM_CHECKOUT as string;
    expect(await unreachable([...load("cases.jsonl"), ...load("heldout/cases.jsonl")], `bun ${join(dir, "src", "cli.ts")}`)).toEqual([]);
  }, 300_000);
});
