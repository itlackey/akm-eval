// The manifest of pair-judge: what a stored run is scored again with (scripts/rescore), and what its case digests cover.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caseDigests } from "../../../lib/manifest.ts";
import { MEASUREMENT } from "./measurement.ts";
import { parseCases, type Case } from "./lib.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const cases = (): Case[] => MEASUREMENT.loadCases(ROOT, { corpus: "public" });

describe("MEASUREMENT", () => {
  test("loads the public cases, and a custom corpus from the folder it recorded", () => {
    expect(cases()).toHaveLength(92);
    const held = MEASUREMENT.loadCases(ROOT, { corpus: "custom", corpus_folder: "evals/pair-judge/assets/heldout" });
    expect(held).toHaveLength(20);
    expect(() => MEASUREMENT.loadCases(ROOT, { corpus: "custom", corpus_folder: null })).toThrow("--cases DIR");
  });
  test("the input is the two notes; the labels hold what the scorer reads besides", () => {
    const c = cases()[0] as Case;
    expect(MEASUREMENT.input(c)).toEqual({ a: c.a, b: c.b });
    expect(MEASUREMENT.labels(c)).toMatchObject({ kind: c.kind, safe: c.safe, only_a: c.only_a, only_b: c.only_b });
  });
  test("a relabelled case changes the label digest and not the input digest, and a changed note the other way", () => {
    const [c] = cases() as [Case];
    const digest = (x: Case) => caseDigests(MEASUREMENT, [x])[x.id]!;
    const relabelled = { ...c, safe: c.safe.length === 0 ? (["a"] as Case["safe"]) : [] };
    expect(digest(relabelled).label_sha256).not.toBe(digest(c).label_sha256);
    expect(digest(relabelled).input_sha256).toBe(digest(c).input_sha256);
    const edited = { ...c, a: { ...c.a, content: `${c.a.content}x` } };
    expect(digest(edited).input_sha256).not.toBe(digest(c).input_sha256);
  });
  test("a stored row scores again to the row it was", () => {
    const [c] = cases() as [Case];
    const row = MEASUREMENT.score(c, { verdict: { onlyInA: [], onlyInB: [], relation: "duplicate", redundant: "A", confidence: 0.5, reason: "r", engine: "judge", schemaVersion: 1 }, seconds: 3 });
    const back = MEASUREMENT.rawOf(JSON.parse(JSON.stringify(row)));
    expect(back).toHaveProperty("raw");
    expect(MEASUREMENT.score(c, (back as { raw: any }).raw)).toEqual(row);
    expect(MEASUREMENT.errored(row)).toBe(false);
  });
  test("the cases file parses as the eval reads it", () => {
    expect(parseCases(readFileSync(join(ROOT, "evals", "pair-judge", "assets", "cases.jsonl"), "utf8"))).toHaveLength(92);
  });
});
